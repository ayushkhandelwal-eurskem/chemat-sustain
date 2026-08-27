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

import os

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
    monkeypatch.setenv("AUDIT_HMAC_KEY", "x" * 32)
    monkeypatch.setenv("ENABLE_API_DOCS", "true")

    with pytest.raises(RuntimeError, match="ENABLE_API_DOCS"):
        get_settings()


def test_app_exposes_no_schema_routes_by_default(tmp_path):
    """End-to-end: assert against the mounted routes, not just config.

    Runs in a SUBPROCESS deliberately. The first version of this test called
    importlib.reload(app) inside the pytest process, which re-executed app.py's
    module-level `settings = get_settings()` under a monkeypatched environment
    and left that in the lru_cache and in sys.modules. A child process cannot
    corrupt this process's environment or cached Settings instance.

    A child process cannot corrupt this process's caches, so the check keeps its
    end-to-end value without the coupling.
    """
    import subprocess
    import sys
    from pathlib import Path

    backend_dir = Path(__file__).resolve().parent.parent

    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "DATABASE_URL": "postgresql+asyncpg://u:p@localhost/db",
        # APP_ENV deliberately absent - the exact production misconfiguration.
        "PROTOCOL_FILE_DIR": str(tmp_path / "protocols"),
        "TENANT_DATA_ROOT": str(tmp_path / "tenants"),
    }

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import app; "
            "print(' '.join(sorted({getattr(r,'path','') for r in app.app.routes} "
            "& {'/docs','/redoc','/openapi.json'})))",
        ],
        cwd=backend_dir,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )

    assert result.returncode == 0, f"app failed to import:\n{result.stderr[-2000:]}"

    leaked = result.stdout.strip().splitlines()[-1].strip() if result.stdout.strip() else ""
    assert leaked == "", (
        f"schema routes are mounted and would serve anonymously: {leaked}"
    )
