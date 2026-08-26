"""Deny-by-default Phase 1 consortium APIs."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.security import Organisation
from api.models.test import Test
from api.models_tree import Category, Protocol
from security.audit import append_audit_event
from security.auth import Principal, get_principal, require_scopes
from security.config import get_settings
from security.files import resolve_beneath, safe_filename
from security.tenant import get_tenant_db
from utils.db import get_db


router = APIRouter(prefix="/v1", tags=["Phase 1 Research APIs"])


async def _platform_operator_org(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> str | None:
    """Organisation id of the platform operator, when the caller belongs to it.

    PLATFORM_OPERATOR_ORG_SLUG names the organisation that operates the
    platform itself. Its credentials may READ research data across every
    tenant - a deliberate, explicitly configured deviation from the
    least-privilege data-plane stance documented in
    migrations/sql/004_enforce_tenancy.sql ("even a platform administrator
    does not read partner research data through the application").

    Returns None unless the setting is configured AND the caller's
    organisation matches it, so an unconfigured deployment keeps the strict
    tenant scope and partners are never widened.
    """
    slug = get_settings().platform_operator_org_slug
    if not slug or not principal.organisation_id:
        return None
    row = (
        await db.execute(select(Organisation.id).where(Organisation.slug == slug))
    ).first()
    return row[0] if row is not None and row[0] == principal.organisation_id else None


@router.get("/tests")
async def tests(
    principal: Principal = Depends(require_scopes("tests:read")),
    db: AsyncSession = Depends(get_tenant_db),
    platform_org: str | None = Depends(_platform_operator_org),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = select(Test)
    if platform_org is None:
        query = query.where(Test.organisation_id == principal.organisation_id)
    records = (
        await db.execute(query.order_by(Test.id).offset(offset).limit(limit))
    ).scalars().all()
    return [
        {
            "id": item.id,
            # Included so cross-tenant listings (platform operator) can tell
            # which partner owns each record; harmless for tenant listings.
            "organisation_id": item.organisation_id,
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
    platform_org: str | None = Depends(_platform_operator_org),
):
    conditions = [Test.id == test_id]
    if platform_org is None:
        conditions.append(Test.organisation_id == principal.organisation_id)
    record = (
        await db.execute(select(Test).where(*conditions))
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
    platform_org: str | None = Depends(_platform_operator_org),
):
    query = select(Protocol)
    if platform_org is None:
        query = query.where(Protocol.organisation_id == principal.organisation_id)
    records = (await db.execute(query.order_by(Protocol.sort_order))).scalars().all()
    return [
        {
            "id": item.id,
            # See /v1/tests: attribution for cross-tenant listings.
            "organisation_id": item.organisation_id,
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
    platform_org: str | None = Depends(_platform_operator_org),
):
    conditions = [Protocol.id == protocol_id]
    if platform_org is None:
        conditions.append(Protocol.organisation_id == principal.organisation_id)
    record = (
        await db.execute(select(Protocol).where(*conditions))
    ).scalar_one_or_none()
    if record is None or not record.file_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    # The file lives under the OWNING tenant's directory. For the platform
    # operator that is the record's organisation, not the caller's.
    owner_org = record.organisation_id if platform_org is not None else principal.organisation_id
    protocol_root = Path(get_settings().protocol_file_dir)
    tenant_root = protocol_root / owner_org
    try:
        relative_path = Path(record.file_path).relative_to(tenant_root)
    except ValueError:
        # Legacy uploads (router_protocol_files) stored files FLAT under the
        # protocol root, not under the owning organisation's directory - so
        # every pre-organisational file failed relative_to above and 404'd
        # even though the DB record passed the tenant check. Fall back to the
        # legacy layout; access is still governed by the record's
        # organisation_id above, and resolve_beneath still confines the
        # served path to the protocol file root.
        try:
            relative_path = Path(record.file_path).relative_to(protocol_root)
        except ValueError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
        path = resolve_beneath(protocol_root, *relative_path.parts)
    else:
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
    platform_org: str | None = Depends(_platform_operator_org),
):
    if not principal.organisation_id:
        # An organisation-less credential has no tenant file area. Falling
        # through would resolve the root to the SHARED data directory and
        # expose every tenant's files, so deny instead. DB-backed endpoints
        # are safe by scoping ("" matches no rows); this one is pure
        # filesystem and needs the explicit guard. (The platform operator
        # below is the one deliberate exception, and only via the
        # PLATFORM_OPERATOR_ORG_SLUG opt-in.)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Credential is not bound to an organisation")
    root = Path(get_settings().tenant_data_root)
    if platform_org is None:
        root = root / principal.organisation_id
    # else: the platform operator's file area is the whole tenant tree, so
    # every organisation's directory is visible and navigable.
    if not root.is_dir():
        # A tenant that has never stored a file has no directory yet. Its
        # file area is empty, not missing - same answer /v1/tests gives an
        # organisation with no test records.
        return []
    parts = tuple(part for part in path.replace("\\", "/").split("/") if part)
    target = resolve_beneath(root, *parts) if parts else root.resolve(strict=True)
    if not target.is_dir():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    return [
        {"name": item.name, "type": "directory" if item.is_dir() else "file", "size": item.stat().st_size}
        for item in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
        if not item.is_symlink() and not item.name.startswith(".")
    ]
