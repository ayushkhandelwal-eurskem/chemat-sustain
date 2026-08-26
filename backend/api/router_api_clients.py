"""Administrator management of partner API credentials.

Authenticated with the existing admin session, so it works from the current
back-office without waiting for the OIDC cutover.

The secret is returned exactly ONCE, in the create and rotate responses, and is
never retrievable afterwards - only a bcrypt hash is stored. If a partner loses
it, rotate; there is no recovery path by design.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.api_client import ApiClient
from api.models.user import User
from api.schemas.user import Role
from security.api_key import (
    generate_client_id,
    generate_client_secret,
    hash_client_secret,
)
from utils.auth import get_current_user
from utils.custom_router import APIRouter
from utils.db import get_db
from utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/admin/api-clients", tags=["API Clients"])


# Scopes an administrator may grant. Kept as an explicit allow-list so a typo
# cannot silently create a credential with a scope no endpoint checks - which
# would look granted but authorise nothing.
ALLOWED_SCOPES = [
    "tests:read",
    "experimental-data:read",
    "protocols:read",
    "protocol-files:download",
    "files:navigate",
]


class ApiClientCreate(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    organisation_id: Optional[str] = None
    user_id: Optional[int] = None
    scopes: List[str] = Field(default_factory=lambda: ["tests:read"])
    note: str = ""


class ApiClientOut(BaseModel):
    id: str
    client_id: str
    name: str
    organisation_id: Optional[str]
    user_id: Optional[int]
    scopes: List[str]
    is_active: bool
    note: str
    created_by: str
    created_at: Optional[object]
    last_used_at: Optional[object]
    secret_version: int

    class Config:
        from_attributes = True


class ApiClientCreated(ApiClientOut):
    # Present only in this response, never on a read.
    client_secret: str
    warning: str = "Copy the client_secret now - it is hashed on save and cannot be shown again."


def _require_admin(user: User) -> None:
    if user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")


def _validate_scopes(scopes: List[str]) -> List[str]:
    cleaned = sorted({s.strip() for s in scopes if s.strip()})
    if not cleaned:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "At least one scope is required")
    unknown = [s for s in cleaned if s not in ALLOWED_SCOPES]
    if unknown:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unknown scope(s): {', '.join(unknown)}. Allowed: {', '.join(ALLOWED_SCOPES)}",
        )
    return cleaned


@router.get("/scopes", response_model=List[str])
async def list_scopes(current_user: User = Depends(get_current_user)):
    """Scopes that may be granted. Drives the admin UI's checkboxes."""
    _require_admin(current_user)
    return ALLOWED_SCOPES


@router.get("", response_model=List[ApiClientOut])
async def list_api_clients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List credentials. Secrets are not included - they are not stored."""
    _require_admin(current_user)
    rows = (await db.execute(select(ApiClient).order_by(ApiClient.created_at.desc()))).scalars().all()
    return list(rows)


@router.post("", response_model=ApiClientCreated, status_code=status.HTTP_201_CREATED)
async def create_api_client(
    payload: ApiClientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Issue a new credential. The secret is shown once, here."""
    _require_admin(current_user)
    scopes = _validate_scopes(payload.scopes)

    client_id = generate_client_id()
    secret = generate_client_secret()

    record = ApiClient(
        client_id=client_id,
        client_secret_hash=hash_client_secret(secret),
        name=payload.name.strip(),
        organisation_id=payload.organisation_id or None,
        user_id=payload.user_id,
        scopes=scopes,
        note=payload.note or "",
        created_by=current_user.email,
        is_active=True,
        secret_version=1,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    # client_id is safe to log; the secret must never be.
    logger.info(
        "API client created",
        extra={"client_id": client_id, "scopes": scopes, "actor": current_user.email},
    )

    out = ApiClientOut.model_validate(record).model_dump()
    return ApiClientCreated(**out, client_secret=secret)


@router.post("/{record_id}/rotate", response_model=ApiClientCreated)
async def rotate_secret(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace the secret. The old one stops working immediately.

    Coordinate with the partner before rotating - there is no grace period in
    which both secrets are valid.
    """
    _require_admin(current_user)
    record = await db.get(ApiClient, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API client not found")

    secret = generate_client_secret()
    record.client_secret_hash = hash_client_secret(secret)
    record.secret_version = (record.secret_version or 1) + 1
    await db.commit()
    await db.refresh(record)

    logger.info(
        "API client secret rotated",
        extra={"client_id": record.client_id, "version": record.secret_version,
               "actor": current_user.email},
    )

    out = ApiClientOut.model_validate(record).model_dump()
    return ApiClientCreated(**out, client_secret=secret)


@router.post("/{record_id}/enable", response_model=ApiClientOut)
async def enable_api_client(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    return await _set_active(db, record_id, True, current_user.email)


@router.post("/{record_id}/disable", response_model=ApiClientOut)
async def disable_api_client(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disable immediately.

    Unlike a bearer token, this takes effect on the very next request - there is
    no issued token left alive until it expires.
    """
    _require_admin(current_user)
    return await _set_active(db, record_id, False, current_user.email)


async def _set_active(db: AsyncSession, record_id: str, active: bool, actor: str) -> ApiClient:
    record = await db.get(ApiClient, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API client not found")
    record.is_active = active
    await db.commit()
    await db.refresh(record)
    logger.info(
        "API client %s", "enabled" if active else "disabled",
        extra={"client_id": record.client_id, "actor": actor},
    )
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_client(
    record_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete permanently.

    Prefer disable: deleting removes the client_id that audit and access logs
    refer to, so past activity can no longer be attributed.
    """
    _require_admin(current_user)
    record = await db.get(ApiClient, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API client not found")
    client_id = record.client_id
    await db.delete(record)
    await db.commit()
    logger.info("API client deleted", extra={"client_id": client_id, "actor": current_user.email})


@router.get("/for-user/{user_id}", response_model=List[ApiClientOut])
async def list_clients_for_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Credentials belonging to one partner user.

    Drives the "API access" section of that user's row in the admin UI, and is
    what you check at offboarding to see what must be disabled.
    """
    _require_admin(current_user)
    rows = (
        await db.execute(
            select(ApiClient).where(ApiClient.user_id == user_id).order_by(ApiClient.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.post("/for-user/{user_id}", response_model=ApiClientCreated,
             status_code=status.HTTP_201_CREATED)
async def issue_for_user(
    user_id: int,
    payload: Optional[ApiClientCreate] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Issue a credential to an existing partner user in one step.

    Adding a partner and giving them API access should not be two disconnected
    jobs, so this takes just the user and sensible defaults: the credential is
    named after them and inherits read scopes.
    """
    _require_admin(current_user)

    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    scopes = _validate_scopes(payload.scopes if payload else ["tests:read"])
    secret = generate_client_secret()
    record = ApiClient(
        client_id=generate_client_id(),
        client_secret_hash=hash_client_secret(secret),
        name=(payload.name if payload and payload.name else f"API access for {target.email}"),
        organisation_id=(payload.organisation_id if payload else None),
        user_id=user_id,
        scopes=scopes,
        note=(payload.note if payload else ""),
        created_by=current_user.email,
        is_active=True,
        secret_version=1,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    logger.info(
        "API client issued for user",
        extra={"client_id": record.client_id, "user_id": user_id, "actor": current_user.email},
    )
    out = ApiClientOut.model_validate(record).model_dump()
    return ApiClientCreated(**out, client_secret=secret)


@router.post("/for-user/{user_id}/disable-all", response_model=List[ApiClientOut])
async def disable_all_for_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Disable every credential belonging to a user - the offboarding action.

    Disabling the user account alone does NOT stop their API keys: keys
    authenticate against api_clients, not the session. Without this, removing
    someone's login would leave their machine access working indefinitely.
    """
    _require_admin(current_user)
    rows = (await db.execute(select(ApiClient).where(ApiClient.user_id == user_id))).scalars().all()
    for record in rows:
        record.is_active = False
    await db.commit()
    logger.info(
        "All API clients disabled for user",
        extra={"user_id": user_id, "count": len(rows), "actor": current_user.email},
    )
    return list(rows)
