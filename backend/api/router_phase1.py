"""Deny-by-default Phase 1 consortium APIs."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import exists, false, func, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.models.test import Test
from api.models_tree import Category, Protocol
from api.models.user_access import UserProtocolAccess, UserTestAccess
from security.audit import append_audit_event
from security.auth import Principal, get_principal, require_scopes
from security.config import get_settings
from security.files import resolve_beneath, safe_filename
from security.tenant import get_tenant_db


router = APIRouter(prefix="/v1", tags=["Phase 1 Research APIs"])


def _test_access(principal: Principal):
    if principal.all_tests or principal.is_platform_tester:
        return true()
    if principal.user_id is None:
        return false()
    return exists().where(
        UserTestAccess.test_id == Test.id,
        UserTestAccess.user_id == principal.user_id,
    )


def _protocol_access(principal: Principal):
    if principal.all_protocols or principal.is_platform_tester:
        return true()
    if principal.user_id is None:
        return false()
    return exists().where(
        UserProtocolAccess.protocol_id == Protocol.id,
        UserProtocolAccess.user_id == principal.user_id,
    )


def _test_index_query(
    principal: Principal,
    test_name: str | None = None,
    test_id: int | None = None,
    unrestricted: bool = False,
):
    """Build the unlimited lightweight test-index query.

    Only four small columns are selected. Full JSON fields are deliberately
    reserved for the one-test detail endpoint: production currently contains
    tens of megabytes of those fields, including multi-megabyte individual
    rows, so an unlimited full-row endpoint would be unsafe.
    """
    query = select(
        Test.id.label("test_id"),
        Test.test_name.label("test_name"),
        Test.work_package_name.label("work_package"),
        Test.element_cms_id.label("identifier"),
    )
    if not unrestricted:
        query = query.where(_test_access(principal))
    if test_name and test_name.strip():
        query = query.where(
            func.upper(Test.test_name) == test_name.strip().upper()
        )
    if test_id is not None:
        query = query.where(Test.id == test_id)
    return query.order_by(Test.work_package_name, Test.id)


def _test_detail_payload(record: Test) -> dict:
    return {
        "test_id": record.id,
        "test_name": record.test_name,
        "work_package": record.work_package_name,
        "identifier": record.element_cms_id,
        "test_details": record.test_details,
        "raw_data": record.raw_data,
        "processed_data": record.processed_data,
        "final_results": record.final_results,
        "statistical_analysis": record.statistical_analysis,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


async def _accessible_test(
    db: AsyncSession,
    principal: Principal,
    test_id: int,
    unrestricted: bool,
) -> Test | None:
    conditions = [Test.id == test_id]
    if not unrestricted:
        conditions.append(_test_access(principal))
    return (
        await db.execute(select(Test).where(*conditions))
    ).scalar_one_or_none()


async def _platform_operator_org(
    principal: Principal = Depends(get_principal),
) -> str | None:
    """Return a marker only for an explicitly approved user/client tester."""
    settings = get_settings()
    if principal.is_platform_tester or principal.client_id in settings.platform_tester_client_ids:
        return "platform-tester"
    return None


@router.get("/tests")
async def tests(
    principal: Principal = Depends(require_scopes("tests:read")),
    db: AsyncSession = Depends(get_tenant_db),
    platform_org: str | None = Depends(_platform_operator_org),
    limit: int = Query(10, ge=1, le=25),
    offset: int = Query(0, ge=0),
):
    query = select(Test)
    if platform_org is None:
        query = query.where(_test_access(principal))
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


@router.get("/test-index")
async def test_index(
    principal: Principal = Depends(require_scopes("tests:read")),
    db: AsyncSession = Depends(get_tenant_db),
    platform_org: str | None = Depends(_platform_operator_org),
    test_name: str | None = Query(default=None, max_length=160),
    test_id: int | None = Query(default=None, ge=1),
):
    """Return every accessible test's lightweight lookup fields.

    There is intentionally no pagination limit: this endpoint excludes all
    heavy JSON data and exists specifically to drive filters and ID lookup.
    """
    records = (
        await db.execute(
            _test_index_query(
                principal,
                test_name=test_name,
                test_id=test_id,
                unrestricted=platform_org is not None,
            )
        )
    ).mappings().all()
    return [dict(record) for record in records]


@router.get("/tests/{test_id}")
async def test_detail(
    test_id: int,
    principal: Principal = Depends(
        require_scopes("tests:read", "experimental-data:read")
    ),
    db: AsyncSession = Depends(get_tenant_db),
    platform_org: str | None = Depends(_platform_operator_org),
):
    """Return the complete data for one authorized test ID."""
    record = await _accessible_test(
        db, principal, test_id, unrestricted=platform_org is not None
    )
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    await append_audit_event(
        db,
        principal,
        "test.read",
        "test",
        str(test_id),
        "success",
        organisation_id=record.organisation_id,
    )
    await db.commit()
    return _test_detail_payload(record)


@router.get("/experimental-data/{test_id}")
async def experimental_data(
    test_id: int,
    principal: Principal = Depends(require_scopes("experimental-data:read")),
    db: AsyncSession = Depends(get_tenant_db),
    platform_org: str | None = Depends(_platform_operator_org),
):
    record = await _accessible_test(
        db, principal, test_id, unrestricted=platform_org is not None
    )
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    await append_audit_event(
        db,
        principal,
        "experimental_data.read",
        "test",
        str(test_id),
        "success",
        organisation_id=record.organisation_id,
    )
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
        query = query.where(_protocol_access(principal))
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
        conditions.append(_protocol_access(principal))
    record = (
        await db.execute(select(Protocol).where(*conditions))
    ).scalar_one_or_none()
    if record is None or not record.file_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    # The file lives under the owning tenant's directory. Explicit grants do
    # not transfer ownership. Legacy unassigned protocols retain the historical
    # shared-file fallback rather than being resolved under the recipient org.
    owner_org = record.organisation_id
    protocol_root = Path(get_settings().protocol_file_dir)
    tenant_root = protocol_root / owner_org if owner_org else protocol_root
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
    await append_audit_event(
        db,
        principal,
        "protocol.download",
        "protocol",
        str(protocol_id),
        "success",
        organisation_id=record.organisation_id,
    )
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
    root = Path(get_settings().tenant_data_root)
    if not principal.all_files and not principal.is_platform_tester and platform_org is None:
        if not principal.organisation_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "User does not have file access")
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
