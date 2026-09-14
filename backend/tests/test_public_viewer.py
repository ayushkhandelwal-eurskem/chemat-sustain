from datetime import datetime, timedelta, timezone
import pytest
from cryptography.fernet import Fernet
from fastapi.routing import APIRoute
from pydantic import ValidationError

from api.controllers.test import has_private_test_access, router as test_router
from api.models.public_access import PublicDataAccessEvent
from api.models.test import Test
from api.models.user import User
from api.schemas.user import PublicRegistration, Role
from api.services.public_access import record_test_access, released_sections
from api.services.user import authenticate_user, register_public_viewer
from scripts.public_access_retention import PREFIX, SUFFIX, prune_archive
from utils.auth import hash_password


class FakeSession:
    def __init__(self):
        self.added = None
        self.committed = False

    def add(self, value):
        self.added = value

    async def flush(self):
        self.added.id = 42

    async def commit(self):
        self.committed = True

    async def refresh(self, value):
        if isinstance(value, PublicDataAccessEvent):
            value.event_id = value.event_id or "event-1"
            value.accessed_at = datetime.now(timezone.utc)


def test_registration_schema_has_no_role_and_requires_strong_password():
    registration = PublicRegistration(
        name="Public Person", email="person@example.org", password="strong-password-123"
    )
    assert "role" not in registration.model_dump()
    with pytest.raises(ValidationError):
        PublicRegistration(name="Public Person", email="person@example.org", password="short")
    with pytest.raises(ValidationError):
        PublicRegistration(name="   ", email="person@example.org", password="strong-password-123")


async def test_registration_always_assigns_public_viewer():
    db = FakeSession()
    registration = PublicRegistration(
        name="  Public   Person ", email="Person@Example.org", password="strong-password-123"
    )
    user = await register_public_viewer(db, registration)
    assert user.name == "Public Person"
    assert user.email == "person@example.org"
    assert user.role == Role.public_viewer
    assert user.is_active is True
    assert user.password != registration.password


async def test_inactive_user_cannot_authenticate(monkeypatch):
    user = User(email="person@example.org", password=hash_password("strong-password-123"), is_active=False)

    async def fake_lookup(_db, _email):
        return user

    monkeypatch.setattr("api.services.user.get_user_by_email", fake_lookup)
    assert await authenticate_user(object(), user.email, "strong-password-123") is False


def test_public_viewer_is_not_private_user():
    assert has_private_test_access(User(role=Role.public_viewer)) is False
    assert has_private_test_access(User(role=Role.user)) is True
    assert has_private_test_access(User(role=Role.admin)) is True


def test_released_sections_respect_public_flags():
    test = Test(
        test_details={"visible": True}, raw_data={"secret": True}, final_results={"ok": True},
        release_test_details=True, release_raw_data=False, release_final_results=True,
        release_processed_data=False, release_statistical_analysis=False,
    )
    assert released_sections(test, private_access=False) == ["test_details", "final_results"]
    assert released_sections(test, private_access=True) == ["test_details", "raw_data", "final_results"]


async def test_record_access_snapshots_user_and_test_metadata():
    db = FakeSession()
    user = User(id=7, name="Public Person", email="PERSON@example.org")
    test = Test(
        id=9, test_name="MTT", work_package_name="WP3", element_cms_id="CMS-1",
        organisation_id="org-1", final_results={"ok": True}, release_final_results=True,
    )
    event = await record_test_access(
        db, user, test, private_access=False, request_id="request-1", source_endpoint="/tests/listings"
    )
    assert db.committed is True
    assert event.user_email == "person@example.org"
    assert event.test_id == 9
    assert event.access_level == "public"
    assert event.released_sections == ["final_results"]
    assert event.request_id == "request-1"


def test_public_read_routes_require_login():
    protected = {"/catalog", "/public", "/{test_id}", "/name/{test_name}", "/listings", "/work-package/{work_package_name}"}
    for route in test_router.routes:
        if (
            not isinstance(route, APIRoute)
            or route.path not in protected
            or not route.methods.intersection({"GET", "POST"})
        ):
            continue
        dependency_names = {
            getattr(dependency.call, "__name__", "") for dependency in route.dependant.dependencies
        }
        assert "get_current_user" in dependency_names, route.path


def test_backup_pruning_removes_only_events_at_or_beyond_20_days(tmp_path):
    cipher = Fernet(Fernet.generate_key())
    now = datetime(2026, 9, 14, 12, tzinfo=timezone.utc)
    records = [
        {"event_id": "expired", "accessed_at": (now - timedelta(days=20)).isoformat()},
        {"event_id": "retained", "accessed_at": (now - timedelta(days=19, hours=23)).isoformat()},
    ]
    path = tmp_path / f"{PREFIX}2026-08-25T1200Z{SUFFIX}"
    path.write_bytes(cipher.encrypt(__import__("json").dumps(records).encode()))

    assert prune_archive(path, cipher, now - timedelta(days=20)) is False
    restored = __import__("json").loads(cipher.decrypt(path.read_bytes()))
    assert [item["event_id"] for item in restored] == ["retained"]