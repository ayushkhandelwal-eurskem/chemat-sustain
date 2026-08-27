import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTH_MODE", "keycloak")
os.environ.setdefault("ENABLE_LEGACY_API", "false")
os.environ.setdefault("KEYCLOAK_ISSUER", "https://identity.example/realms/chemat-sustain")
os.environ.setdefault("KEYCLOAK_JWKS_URL", "https://identity.example/realms/chemat-sustain/protocol/openid-connect/certs")
os.environ.setdefault("KEYCLOAK_AUDIENCE", "chemat-api")
os.environ.setdefault("KEYCLOAK_ALLOWED_AZP", "chemat-portal,approved-machine")
os.environ.setdefault("KEYCLOAK_MACHINE_AZP_PREFIX", "chemat-app-")
os.environ.setdefault("AUDIT_HMAC_KEY", "test-only-key-that-is-never-used-in-production")
os.environ.setdefault("PROTOCOL_FILE_DIR", "/tmp/chemat-sustain-test-protocols")


@pytest.fixture(autouse=True)
def reset_settings_cache():
    from security.config import clear_settings_cache

    clear_settings_cache()
    yield
    clear_settings_cache()
