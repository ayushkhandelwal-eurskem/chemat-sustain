"""HTTP Basic authentication for partner API credentials.

Resolves a client_id/client_secret pair to the SAME Principal object that a
Keycloak bearer token produces. That is the whole design: every endpoint already
depends on `require_scopes(...)` -> `Principal`, so nothing downstream changes.
Scope checks, tenant scoping and row-level security all behave identically
whichever credential was presented.

Partners use ordinary HTTP Basic, which every HTTP client supports:

    curl -u <client_id>:<client_secret> https://database.eurskem.com/api/v1/tests

No token endpoint, no refresh, no expiry to handle.
"""

from __future__ import annotations

import secrets as _secrets
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.api_client import ApiClient
from utils.auth import pwd_context

from .auth import Principal


CLIENT_ID_PREFIX = "cms_"


def generate_client_id() -> str:
    """Public identifier. Prefixed so it is recognisable in logs and tickets."""
    return f"{CLIENT_ID_PREFIX}{_secrets.token_hex(8)}"


def generate_client_secret() -> str:
    """43-char URL-safe secret (~256 bits).

    Kept under bcrypt's 72-byte input limit, above which trailing characters are
    silently ignored - which would quietly weaken the credential.
    """
    return _secrets.token_urlsafe(32)


def hash_client_secret(secret: str) -> str:
    return pwd_context.hash(secret)


async def authenticate_api_client(
    db: AsyncSession, client_id: str, client_secret: str
) -> Principal:
    """Verify a credential pair and return a Principal, or raise 401.

    Every failure returns an identical message. Distinguishing "no such client"
    from "wrong secret" would let an unauthenticated caller enumerate valid
    client_ids.
    """
    unauthorised = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API credentials",
        headers={"WWW-Authenticate": 'Basic realm="chematsustain"'},
    )

    record = (
        await db.execute(select(ApiClient).where(ApiClient.client_id == client_id))
    ).scalars().first()

    if record is None:
        # Hash anyway so a missing client and a wrong secret take comparable
        # time; otherwise the response delay reveals which client_ids exist.
        pwd_context.hash(client_secret)
        raise unauthorised

    if not pwd_context.verify(client_secret, record.client_secret_hash):
        raise unauthorised

    # Checked AFTER the secret, so a disabled credential is indistinguishable
    # from a wrong one to the caller.
    if not record.is_active:
        raise unauthorised

    record.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    return Principal(
        subject=f"api-client:{record.client_id}",
        email=None,                      # machine credential - is_machine is True
        organisation_id=record.organisation_id or "",
        roles=frozenset({"service_account"}),
        scopes=frozenset(record.scopes or []),
        client_id=record.client_id,
        token_id=None,
    )
