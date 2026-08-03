"""Deny-by-default Phase 1 consortium APIs."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.test import Test
from api.models_tree import Category, Protocol
from security.audit import append_audit_event
from security.auth import Principal, require_scopes
from security.config import get_settings
from security.files import resolve_beneath, safe_filename
from security.tenant import get_tenant_db


router = APIRouter(prefix="/v1", tags=["Phase 1 Research APIs"])


@router.get("/tests")
async def tests(
    principal: Principal = Depends(require_scopes("tests:read")),
    db: AsyncSession = Depends(get_tenant_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    records = (
        await db.execute(
            select(Test)
            .where(Test.organisation_id == principal.organisation_id)
            .order_by(Test.id)
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [
        {
            "id": item.id,
            "work_package_name": item.work_package_name,
            "element_cms_id": item.element_cms_id,
            "test_name": item.test_name,
            "test_details": item.test_details,
            "final_results": item.final_results,
            "statistical_analysis": item.statistical_analysis,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        for item in records
    ]


@router.get("/experimental-data/{test_id}")
async def experimental_data(
    test_id: int,
    principal: Principal = Depends(require_scopes("experimental-data:read")),
    db: AsyncSession = Depends(get_tenant_db),
):
    record = (
        await db.execute(
            select(Test).where(
                Test.id == test_id,
                Test.organisation_id == principal.organisation_id,
            )
        )
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    await append_audit_event(db, principal, "experimental_data.read", "test", str(test_id), "success")
    await db.commit()
    return {
        "id": record.id,
        "test_details": record.test_details,
        "raw_data": record.raw_data,
        "processed_data": record.processed_data,
        "final_results": record.final_results,
        "statistical_analysis": record.statistical_analysis,
    }


@router.get("/protocols")
async def protocols(
    principal: Principal = Depends(require_scopes("protocols:read")),
    db: AsyncSession = Depends(get_tenant_db),
):
    records = (
        await db.execute(
            select(Protocol).where(Protocol.organisation_id == principal.organisation_id).order_by(Protocol.sort_order)
        )
    ).scalars().all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "file_name": item.file_name,
            "file_mime": item.file_mime,
            "file_size": item.file_size,
        }
        for item in records
    ]


@router.get("/protocols/{protocol_id}/download")
async def download_protocol(
    protocol_id: int,
    principal: Principal = Depends(require_scopes("protocol-files:download")),
    db: AsyncSession = Depends(get_tenant_db),
):
    record = (
        await db.execute(
            select(Protocol).where(
                Protocol.id == protocol_id,
                Protocol.organisation_id == principal.organisation_id,
            )
        )
    ).scalar_one_or_none()
    if record is None or not record.file_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    tenant_root = Path(get_settings().protocol_file_dir) / principal.organisation_id
    try:
        relative_path = Path(record.file_path).relative_to(tenant_root)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    path = resolve_beneath(tenant_root, *relative_path.parts)
    await append_audit_event(db, principal, "protocol.download", "protocol", str(protocol_id), "success")
    await db.commit()
    return FileResponse(
        path,
        media_type=record.file_mime or "application/octet-stream",
        filename=safe_filename(record.file_name or "protocol"),
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/files")
async def navigate_files(
    path: str = "",
    principal: Principal = Depends(require_scopes("files:navigate")),
):
    root = Path(get_settings().tenant_data_root) / principal.organisation_id
    parts = tuple(part for part in path.replace("\\", "/").split("/") if part)
    target = resolve_beneath(root, *parts) if parts else root.resolve(strict=True)
    if not target.is_dir():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    return [
        {"name": item.name, "type": "directory" if item.is_dir() else "file", "size": item.stat().st_size}
        for item in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
        if not item.is_symlink() and not item.name.startswith(".")
    ]
