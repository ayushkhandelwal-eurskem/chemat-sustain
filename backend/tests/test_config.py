import pytest

from security.config import clear_settings_cache, get_settings


def test_production_accepts_local_authentication(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    clear_settings_cache()
    assert get_settings().is_production


def test_production_rejects_auto_ddl(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ENABLE_AUTO_DDL", "true")
    clear_settings_cache()
    with pytest.raises(RuntimeError, match="ENABLE_AUTO_DDL"):
        get_settings()


def test_wildcard_cors_is_rejected(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("CORS_ORIGINS", "*")
    clear_settings_cache()
    with pytest.raises(RuntimeError, match="Wildcard CORS"):
        get_settings()


def test_valid_local_config(monkeypatch):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("ENABLE_AUTO_DDL", "false")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000")
    clear_settings_cache()
    assert get_settings().cors_origins == ("http://localhost:3000",)


def test_platform_tester_client_ids_are_parsed(monkeypatch):
    monkeypatch.setenv("PLATFORM_TESTER_CLIENT_IDS", "cms_one, cms_two")
    clear_settings_cache()
    assert get_settings().platform_tester_client_ids == ("cms_one", "cms_two")
