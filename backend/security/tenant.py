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
    is_platform_tester = bool(
        principal.client_id
        and principal.client_id in get_settings().platform_tester_client_ids
    )
    await db.execute(
        text("SELECT set_config('app.platform_governance', :enabled, true)"),
        {"enabled": "on" if is_platform_tester else "off"},
    )
    return db
