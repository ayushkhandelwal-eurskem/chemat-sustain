"""Local API-client authentication and deny-by-default authorization."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPBasic,
    HTTPBasicCredentials,
)
from sqlalchemy.ext.asyncio import AsyncSession


async def _db_session():
    """Database dependency, imported lazily to avoid a circular import.

    utils.db imports security.config, and security/__init__ imports this module,
    so a top-level `from utils.db import get_db` here closes the loop and fails
    at startup with "cannot import name 'get_db' from partially initialized
    module". Deferring the import to call time breaks the cycle.
    """
    from utils.db import get_db

    async for session in get_db():
        yield session


# auto_error=False keeps missing credentials under the explicit generic 401
# below. API client IDs and secrets are issued by the local administrator and
# stored only as bcrypt hashes; no external identity provider is involved.
basic_auth = HTTPBasic(auto_error=False)


@dataclass(frozen=True)
class Principal:
    subject: str
    email: str | None
    organisation_id: str
    roles: frozenset[str]
    scopes: frozenset[str]
    client_id: str | None
    token_id: str | None
    user_id: int | None = None
    all_tests: bool = False
    all_protocols: bool = False
    all_files: bool = False
    is_platform_tester: bool = False
    audit_organisation_id: str | None = None

    @property
    def is_machine(self) -> bool:
        return self.client_id is not None and self.email is None


async def get_principal(
    basic: HTTPBasicCredentials | None = Depends(basic_auth),
    db: AsyncSession = Depends(_db_session),
) -> Principal:
    """Resolve a local HTTP Basic API credential to a tenant Principal."""
    if basic is not None and basic.username and basic.password:
        # Imported here rather than at module scope: security.api_key imports
        # Principal from this module, so a top-level import would be circular.
        from .api_key import authenticate_api_client

        return await authenticate_api_client(db, basic.username, basic.password)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="API client credentials required",
        headers={"WWW-Authenticate": 'Basic realm="chematsustain"'},
    )


def require_scopes(*required: str) -> Callable[..., Principal]:
    async def dependency(principal: Principal = Depends(get_principal)) -> Principal:
        missing = set(required) - principal.scopes
        if missing:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient scope")
        return principal

    return dependency


def require_roles(*allowed: str) -> Callable[..., Principal]:
    async def dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if not principal.roles.intersection(allowed):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return principal

    return dependency
