"""Fail-closed application configuration.

Secrets are read from the environment only.  No production-friendly default is
provided for a credential, signing key, database URL, or Keycloak client secret.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable


TRUTHY = {"1", "true", "yes", "on"}


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in TRUTHY


def _csv(name: str, default: str = "") -> tuple[str, ...]:
    return tuple(item.strip() for item in os.getenv(name, default).split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    auth_mode: str
    enable_legacy_api: bool
    enable_auto_ddl: bool
    keycloak_issuer: str
    keycloak_audience: str
    keycloak_jwks_url: str
    keycloak_allowed_azp: tuple[str, ...]
    keycloak_machine_azp_prefix: str
    keycloak_admin_base_url: str
    keycloak_realm: str
    keycloak_admin_client_id: str
    keycloak_admin_client_secret: str
    enable_keycloak_provisioning: bool
    cors_origins: tuple[str, ...]
    protocol_file_dir: str
    tenant_data_root: str
    max_upload_bytes: int
    audit_hmac_key: str

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def validate(self) -> None:
        if self.auth_mode not in {"keycloak", "legacy"}:
            raise RuntimeError("AUTH_MODE must be 'keycloak' or 'legacy'")
        if self.is_production and self.auth_mode != "keycloak":
            raise RuntimeError("Production requires AUTH_MODE=keycloak")
        if self.is_production and self.enable_legacy_api:
            raise RuntimeError("ENABLE_LEGACY_API must be false in production")
        if self.is_production and self.enable_auto_ddl:
            raise RuntimeError("ENABLE_AUTO_DDL must be false in production")
        if self.auth_mode == "keycloak":
            missing = [
                name
                for name, value in (
                    ("KEYCLOAK_ISSUER", self.keycloak_issuer),
                    ("KEYCLOAK_AUDIENCE", self.keycloak_audience),
                    ("KEYCLOAK_JWKS_URL", self.keycloak_jwks_url),
                )
                if not value
            ]
            if missing:
                raise RuntimeError(f"Missing required Keycloak settings: {', '.join(missing)}")
        if self.enable_keycloak_provisioning:
            missing = [
                name
                for name, value in (
                    ("KEYCLOAK_ADMIN_BASE_URL", self.keycloak_admin_base_url),
                    ("KEYCLOAK_REALM", self.keycloak_realm),
                    ("KEYCLOAK_ADMIN_CLIENT_ID", self.keycloak_admin_client_id),
                    ("KEYCLOAK_ADMIN_CLIENT_SECRET", self.keycloak_admin_client_secret),
                )
                if not value
            ]
            if missing:
                raise RuntimeError(f"Missing Keycloak provisioning settings: {', '.join(missing)}")
        if self.is_production and not self.audit_hmac_key:
            raise RuntimeError("AUDIT_HMAC_KEY is required in production")
        if "*" in self.cors_origins:
            raise RuntimeError("Wildcard CORS origins are not permitted")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    issuer = os.getenv("KEYCLOAK_ISSUER", "").rstrip("/")
    settings = Settings(
        environment=os.getenv("APP_ENV", "development"),
        database_url=database_url,
        auth_mode=os.getenv("AUTH_MODE", "legacy").lower(),
        enable_legacy_api=_bool("ENABLE_LEGACY_API", True),
        enable_auto_ddl=_bool("ENABLE_AUTO_DDL", False),
        keycloak_issuer=issuer,
        keycloak_audience=os.getenv("KEYCLOAK_AUDIENCE", ""),
        keycloak_jwks_url=os.getenv(
            "KEYCLOAK_JWKS_URL",
            f"{issuer}/protocol/openid-connect/certs" if issuer else "",
        ),
        keycloak_allowed_azp=_csv("KEYCLOAK_ALLOWED_AZP"),
        keycloak_machine_azp_prefix=os.getenv("KEYCLOAK_MACHINE_AZP_PREFIX", "chemat-app-"),
        keycloak_admin_base_url=os.getenv("KEYCLOAK_ADMIN_BASE_URL", "").rstrip("/"),
        keycloak_realm=os.getenv("KEYCLOAK_REALM", "chemat-sustain"),
        keycloak_admin_client_id=os.getenv("KEYCLOAK_ADMIN_CLIENT_ID", ""),
        keycloak_admin_client_secret=os.getenv("KEYCLOAK_ADMIN_CLIENT_SECRET", ""),
        enable_keycloak_provisioning=_bool("ENABLE_KEYCLOAK_PROVISIONING", False),
        cors_origins=_csv("CORS_ORIGINS", "http://localhost:3000"),
        protocol_file_dir=os.getenv("PROTOCOL_FILE_DIR", "/data/protocol_files"),
        tenant_data_root=os.getenv("TENANT_DATA_ROOT", "/data/tenants"),
        max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024))),
        audit_hmac_key=os.getenv("AUDIT_HMAC_KEY", ""),
    )
    settings.validate()
    return settings


def clear_settings_cache() -> None:
    """Test helper; production code should not mutate process configuration."""

    get_settings.cache_clear()
