"""Keycloak-free compatibility endpoints for existing API clients."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.security import ApiDefinition
from security.auth import Principal, get_principal
from security.tenant import get_tenant_db


router = APIRouter(prefix="/v1/portal", tags=["API Client Portal"])


@router.get("/me")
async def me(principal: Principal = Depends(get_principal)):
    """Verify a locally issued API credential without returning secret data."""
    return {
        "subject": principal.subject,
        "email": principal.email,
        "organisation_id": principal.organisation_id,
        "roles": sorted(principal.roles),
        "scopes": sorted(principal.scopes),
        "client_id": principal.client_id,
    }


@router.get("/catalog")
async def catalogue(
    _: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_tenant_db),
):
    definitions = (
        await db.execute(select(ApiDefinition).where(ApiDefinition.is_active.is_(True)))
    ).scalars().all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "version": item.version,
            "description": item.description,
            "classification": item.classification,
            "scopes": item.scopes,
        }
        for item in definitions
    ]