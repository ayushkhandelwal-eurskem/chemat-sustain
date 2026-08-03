"""OAuth2/OIDC resource-server validation against Keycloak.

This module is the single place that turns a raw Bearer token into a
trusted Principal. Every claim the rest of the application relies on -
especially `organisation_id` for tenant scoping - must come from here, and
never from a client-supplied header, query parameter, or request body.

Validation is deliberately strict and fails closed: missing or malformed
claims are rejected, not defaulted.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status

from utils.logging_config import get_logger

logger = get_logger(__name__)

KEYCLOAK_ISSUER_URL = os.getenv("KEYCLOAK_ISSUER_URL", "")
KEYCLOAK_BACKEND_AUDIENCE = os.getenv("KEYCLOAK_BACKEND_AUDIENCE", "chematsustain-api")
_JWKS_URL = f"{KEYCLOAK_ISSUER_URL}/protocol/openid-connect/certs" if KEYCLOAK_ISSUER_URL else ""

# PyJWKClient caches keys in-memory and refreshes on unknown kid, so we do not
# need to build our own JWKS caching/refresh logic.
_jwk_client: Optional["jwt.PyJWKClient"] = None


def _get_jwk_client() -> "jwt.PyJWKClient":
    global _jwk_client
    if _jwk_client is None:
        if not KEYCLOAK_ISSUER_URL:
            raise RuntimeError("KEYCLOAK_ISSUER_URL is not configured")
        _jwk_client = jwt.PyJWKClient(_JWKS_URL, cache_keys=True)
    return _jwk_client


@dataclass(frozen=True)
class Principal:
    subject: str
    organisation_id: str
    roles: frozenset[str]
    scopes: frozenset[str]
    authorized_party: str
    raw_claims: dict = field(repr=False)

    def has_role(self, role: str) -> bool:
        return role in self.roles

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes


class TokenValidationError(Exception):
    """Raised for any token rejection. Message is safe to log; never returned to the client verbatim."""


def _decode_and_validate(token: str) -> dict:
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
    except jwt.PyJWKClientError as exc:
        raise TokenValidationError(f"Unable to resolve signing key: {exc}") from exc
    except jwt.exceptions.DecodeError as exc:
        raise TokenValidationError(f"Malformed token: {exc}") from exc

    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=KEYCLOAK_ISSUER_URL,
            audience=KEYCLOAK_BACKEND_AUDIENCE,
            options={
                "require": ["exp", "iat", "iss", "aud", "sub"],
                "verify_signature": True,
                "verify_exp": True,
                "verify_iat": True,
                "verify_iss": True,
                "verify_aud": True,
            },
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenValidationError(f"Token expired: {exc}") from exc
    except jwt.InvalidIssuerError as exc:
        raise TokenValidationError(f"Invalid issuer: {exc}") from exc
    except jwt.InvalidAudienceError as exc:
        raise TokenValidationError(f"Invalid audience: {exc}") from exc
    except jwt.InvalidSignatureError as exc:
        raise TokenValidationError(f"Invalid signature: {exc}") from exc
    except jwt.MissingRequiredClaimError as exc:
        raise TokenValidationError(f"Missing required claim: {exc}") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenValidationError(f"Invalid token: {exc}") from exc

    return claims


def _extract_principal(claims: dict) -> Principal:
    org_id = claims.get("organisation_id")
    if not org_id or not isinstance(org_id, str):
        raise TokenValidationError(
            f"Token missing a single organisation_id claim (got: {claims.get('organisation_id')!r})"
        )

    subject = claims.get("sub")
    if not subject:
        raise TokenValidationError("Token missing sub claim")

    azp = claims.get("azp") or claims.get("client_id")
    if not azp:
        raise TokenValidationError("Token missing azp/client_id (authorized party) claim")

    roles = frozenset(claims.get("realm_access", {}).get("roles", []))
    scope_str = claims.get("scope", "")
    scopes = frozenset(s for s in scope_str.split(" ") if s)

    return Principal(
        subject=subject,
        organisation_id=org_id,
        roles=roles,
        scopes=scopes,
        authorized_party=azp,
        raw_claims=claims,
    )


def validate_bearer_token(token: str) -> Principal:
    """Validate a raw Bearer token string and return the resulting Principal.

    Raises TokenValidationError on any failure - callers must not leak the
    exception message to API clients.
    """
    claims = _decode_and_validate(token)
    return _extract_principal(claims)


async def get_current_principal(request: Request) -> Principal:
    """FastAPI dependency: extract and validate the Bearer token on the request.

    Fails closed with a generic 401 on any validation failure - the specific
    reason is logged server-side only.
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = auth_header[len("bearer "):].strip()
    try:
        return validate_bearer_token(token)
    except TokenValidationError as exc:
        logger.warning(f"Token validation failed: {exc}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def require_scope(required_scope: str):
    """Dependency factory: deny-by-default scope check."""
    async def _check(principal: Principal = Depends(get_current_principal)) -> Principal:
        if not principal.has_scope(required_scope):
            logger.warning(
                f"Scope denied: subject={principal.subject} org={principal.organisation_id} "
                f"required={required_scope} has={sorted(principal.scopes)}"
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient scope")
        return principal
    return _check


def require_role(required_role: str):
    """Dependency factory: deny-by-default role check."""
    async def _check(principal: Principal = Depends(get_current_principal)) -> Principal:
        if not principal.has_role(required_role):
            logger.warning(
                f"Role denied: subject={principal.subject} org={principal.organisation_id} "
                f"required={required_role} has={sorted(principal.roles)}"
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return principal
    return _check
