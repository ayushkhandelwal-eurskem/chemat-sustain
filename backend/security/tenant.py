"""Tenant context helpers used with PostgreSQL Row-Level Security."""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from security.auth import Principal, get_principal
from security.config import get_settings
from utils.db import get_db


async def get_tenant_db(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> AsyncSession:
    # set_config(..., true) is transaction-local and cannot leak through the pool.
    await db.execute(
        text("SELECT set_config('app.current_organisation_id', :organisation_id, true)"),
        {"organisation_id": principal.organisation_id},
    )
    await db.execute(text("SELECT set_config('app.bypass_rls', 'false', true)"))
    # all_tests means every current and future test, including non-public rows
    # owned by another organisation. Keep this separate from platform_governance
    # so it broadens only the tests SELECT policy—not protocols, files, grant
    # tables, or any write policy.
    await db.execute(
        text("SELECT set_config('app.all_tests_access', :enabled, true)"),
        {"enabled": "on" if principal.all_tests else "off"},
    )
    is_platform_tester = principal.is_platform_tester or bool(
        principal.client_id
        and principal.client_id in get_settings().platform_tester_client_ids
    )
    await db.execute(
        text("SELECT set_config('app.platform_governance', :enabled, true)"),
        {"enabled": "on" if is_platform_tester else "off"},
    )
    return db
