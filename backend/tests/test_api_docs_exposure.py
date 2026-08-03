"""The API schema must not be publishable by omission.

Production was serving /docs, /redoc and /openapi.json anonymously: 38
endpoints and 45 operations, 26 of them state-changing, plus internal schema
and field names. The controls existed in code but were gated on `is_production`,
which derives from APP_ENV and defaults to "development" - so a deployment that
simply never set APP_ENV published the whole attack surface.

These tests pin the fail-closed behaviour: docs are off unless explicitly asked
for, and cannot be turned on in production at all.
"""

from __future__ import annotations

import pytest

from security.config import get_settings


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    # get_settings is lru_cached; without this the first test's env wins.
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _base_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
    monkeypatch.setenv("AUTH_MODE", "legacy")
    monkeypatch.delenv("ENABLE_API_DOCS", raising=False)


def test_docs_disabled_when_app_env_is_unset(monkeypatch):
    """The exact production misconfiguration: APP_ENV never set.

    Before the fix this yielded environment="development", is_production=False,
    and three public documentation endpoints.
    """
    _base_env(monkeypatch)
    monkeypatch.delenv("APP_ENV", raising=False)

    settings = get_settings()

    assert not settings.is_production, "precondition: this is the fail-open case"
    assert settings.enable_api_docs is False, (
        "docs must stay closed when APP_ENV is absent - otherwise forgetting one "
        "environment variable republishes the API surface"
    )


def test_docs_require_explicit_opt_in(monkeypatch):
    _base_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "development")
    assert get_settings().enable_api_docs is False

    get_settings.cache_clear()
    monkeypatch.setenv("ENABLE_API_DOCS", "true")
    assert get_settings().enable_api_docs is True


def test_docs_cannot_be_enabled_in_production(monkeypatch):
    """Defence in depth: refuse to start rather than publish the schema."""
    _base_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_MODE", "keycloak")
    monkeypatch.setenv("KEYCLOAK_ISSUER", "https://auth.example.test/realms/r")
    monkeypatch.setenv("KEYCLOAK_AUDIENCE", "api")
    monkeypatch.setenv("AUDIT_HMAC_KEY", "x" * 32)
    monkeypatch.setenv("ENABLE_LEGACY_API", "false")
    monkeypatch.setenv("ENABLE_API_DOCS", "true")

    with pytest.raises(RuntimeError, match="ENABLE_API_DOCS"):
        get_settings()


def test_app_exposes_no_schema_routes_by_default(monkeypatch):
    """End-to-end: assert against the mounted routes, not just config."""
    _base_env(monkeypatch)
    monkeypatch.delenv("APP_ENV", raising=False)

    import importlib

    import app as app_module

    importlib.reload(app_module)

    paths = {getattr(r, "path", None) for r in app_module.app.routes}
    for leaked in ("/docs", "/redoc", "/openapi.json"):
        assert leaked not in paths, f"{leaked} is mounted and would serve anonymously"
