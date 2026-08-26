"""Keycloak JWT validation and deny-by-default authorization dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBasic,
    HTTPBasicCredentials,
    HTTPBearer,
)
from jwt import PyJWKClient
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings


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


bearer = HTTPBearer(auto_error=False)

# auto_error=False so a request with no Authorization header falls through to
# the explicit 401 in get_principal rather than FastAPI raising first. That also
# keeps the WWW-Authenticate header on unauthenticated responses as "Bearer",
# which stops browsers popping up a Basic-auth login box on ordinary 401s.
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


def _claims_to_principal(claims: dict[str, Any]) -> Principal:
    organisation_id = claims.get("organisation_id")
    if not isinstance(organisation_id, str) or not organisation_id.strip():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token has no organisation_id claim")

    realm_roles = claims.get("realm_access", {}).get("roles", [])
    resource_roles: list[str] = []
    for resource in claims.get("resource_access", {}).values():
        resource_roles.extend(resource.get("roles", []))

    raw_scope = claims.get("scope", "")
    scopes = raw_scope.split() if isinstance(raw_scope, str) else list(raw_scope or [])
    client_id = claims.get("azp") or claims.get("client_id")

    return Principal(
        subject=str(claims["sub"]),
        email=claims.get("email"),
        organisation_id=organisation_id.strip(),
        roles=frozenset(str(role) for role in (*realm_roles, *resource_roles)),
        scopes=frozenset(str(scope) for scope in scopes),
        client_id=str(client_id) if client_id else None,
        token_id=str(claims["jti"]) if claims.get("jti") else None,
    )


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str) -> PyJWKClient:
    """One long-lived JWKS client per URL.

    Constructing PyJWKClient per request defeats cache_keys entirely - the cache
    lives on the instance, so a fresh instance refetches the JWKS on EVERY
    request. That means a network round-trip to Keycloak per API call, and it
    makes Keycloak a hard availability dependency of every request rather than
    only of login. It is also a self-inflicted request amplifier against the
    identity provider under load.

    lifespan is bounded by the process; PyJWKClient still refetches on its own
    when it sees an unknown `kid`, so key rotation is picked up without a
    restart.
    """
    return PyJWKClient(jwks_url, cache_keys=True)


def decode_access_token(token: str) -> Principal:
    settings = get_settings()
    try:
        signing_key = _jwks_client(settings.keycloak_jwks_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.keycloak_audience,
            issuer=settings.keycloak_issuer,
            options={
                "require": ["sub", "iss", "aud", "exp", "iat"],
                "verify_signature": True,
                "verify_exp": True,
                "verify_iat": True,
                "verify_aud": True,
                "verify_iss": True,
            },
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    azp = claims.get("azp")
    known_human_client = azp in settings.keycloak_allowed_azp
    managed_machine_client = bool(
        isinstance(azp, str)
        and settings.keycloak_machine_azp_prefix
        and azp.startswith(settings.keycloak_machine_azp_prefix)
    )
    if not known_human_client and not managed_machine_client:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token client is not authorised")
    return _claims_to_principal(claims)


async def get_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    basic: HTTPBasicCredentials | None = Depends(basic_auth),
    db: AsyncSession = Depends(_db_session),
) -> Principal:
    """Resolve a caller to a Principal from either credential type.

    Bearer (Keycloak OIDC) is the target mechanism. HTTP Basic accepts an
    administrator-issued client_id/client_secret from the api_clients table and
    produces an equivalent Principal, so partners can be given working access
    before the OIDC cutover. Both paths converge here, which means scope checks,
    tenant scoping and row-level security downstream cannot tell them apart and
    cannot be bypassed by choosing one over the other.

    Bearer is tried first: if a caller sends both, the stronger, expiring
    credential wins.
    """
    if credentials is not None and credentials.scheme.lower() == "bearer":
        return decode_access_token(credentials.credentials)

    if basic is not None and basic.username and basic.password:
        # Imported here rather than at module scope: security.api_key imports
        # Principal from this module, so a top-level import would be circular.
        from .api_key import authenticate_api_client

        return await authenticate_api_client(db, basic.username, basic.password)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Bearer token or API client credentials required",
        headers={"WWW-Authenticate": "Bearer"},
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
