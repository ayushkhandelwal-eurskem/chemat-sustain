import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUDIT_HMAC_KEY", "test-only-key-that-is-never-used-in-production")
os.environ.setdefault("PROTOCOL_FILE_DIR", "/tmp/chemat-sustain-test-protocols")


@pytest.fixture(autouse=True)
def reset_settings_cache():
    from security.config import clear_settings_cache

    clear_settings_cache()
    yield
    clear_settings_cache()
