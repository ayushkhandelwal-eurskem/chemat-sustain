"""Fail-closed application configuration.

Secrets are read from the environment only. No production-friendly default is
provided for a credential, signing key or database URL.
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
    enable_auto_ddl: bool
    cors_origins: tuple[str, ...]
    protocol_file_dir: str
    tenant_data_root: str
    max_upload_bytes: int
    audit_hmac_key: str
    # Publishes /docs, /redoc and /openapi.json. Defaults to False so that an
    # incomplete environment cannot expose the API surface - see app.py.
    enable_api_docs: bool = False
    # Slug of the organisation that OPERATES the platform. Credentials bound
    # to it may read research data across every tenant through the /v1 APIs
    # (see router_phase1). Empty by default: cross-tenant read is OFF unless
    # a deployment explicitly opts in.
    platform_operator_org_slug: str = ""
    # Explicit API client IDs allowed to test the complete consortium API.
    # Unlike platform_operator_org_slug, this does not widen every credential
    # belonging to an organisation. Empty by default: no tester bypass.
    platform_tester_client_ids: tuple[str, ...] = ()

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def validate(self) -> None:
        if self.is_production and self.enable_auto_ddl:
            raise RuntimeError("ENABLE_AUTO_DDL must be false in production")
        if self.is_production and not self.audit_hmac_key:
            raise RuntimeError("AUDIT_HMAC_KEY is required in production")
        # Defence in depth: enable_api_docs already defaults to False, so this
        # only fires if someone sets ENABLE_API_DOCS=true against a production
        # APP_ENV. Refuse to start rather than publish the API surface.
        if self.is_production and self.enable_api_docs:
            raise RuntimeError("ENABLE_API_DOCS must be false in production")
        if "*" in self.cors_origins:
            raise RuntimeError("Wildcard CORS origins are not permitted")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    settings = Settings(
        environment=os.getenv("APP_ENV", "development"),
        database_url=database_url,
        enable_auto_ddl=_bool("ENABLE_AUTO_DDL", False),
        cors_origins=_csv("CORS_ORIGINS", "http://localhost:3000"),
        protocol_file_dir=os.getenv("PROTOCOL_FILE_DIR", "/data/protocol_files"),
        tenant_data_root=os.getenv("TENANT_DATA_ROOT", "/data/tenants"),
        max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024))),
        audit_hmac_key=os.getenv("AUDIT_HMAC_KEY", ""),
        enable_api_docs=_bool("ENABLE_API_DOCS", False),
        platform_operator_org_slug=os.getenv("PLATFORM_OPERATOR_ORG_SLUG", ""),
        platform_tester_client_ids=_csv("PLATFORM_TESTER_CLIENT_IDS"),
    )
    settings.validate()
    return settings


def clear_settings_cache() -> None:
    """Test helper; production code should not mutate process configuration."""

    get_settings.cache_clear()
