from datetime import datetime, timedelta, timezone
from itertools import product
from unittest.mock import AsyncMock, MagicMock
import pytest
from cryptography.fernet import Fernet
from fastapi.routing import APIRoute
from pydantic import ValidationError

from api.controllers.test import (
    PARSERS,
    build_payload_from_parse,
    has_private_test_access,
    router as test_router,
)
from api.models.public_access import PublicDataAccessEvent
from api.models.test import Test
from api.models.user import User
from api.schemas.test import TestListings, TestReleaseSelection
from api.schemas.user import PublicRegistration, Role
from api.services.public_access import record_test_access, released_sections
from api.services.test import (
    RELEASE_FIELDS,
    TestService,
    catalog_material_metadata,
    mask_test_for_public,
    public_test_header_metadata,
)
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


def test_public_header_metadata_keeps_only_report_identification_fields():
    details = {
        "work_package": {
            "full_test_name": "Ultraviolet Photoelectron Spectroscopy",
            "test_acronym": "UPS",
            "test_type": "Physicochemical characterisation",
            "endpoint": "Electronic structure",
            "endpoint_outcome": "Work function",
            "sop": "SOP-UPS-01",
            "partner": "must remain private",
            "lead_scientists": [{"name": "must remain private"}],
        },
        "material": {
            "erm_id": "ERM-123",
            "material_name": "must remain private",
            "core_chemistry": "must remain private",
        },
        "instrumentation": {"instrument_model": "must remain private"},
    }

    assert public_test_header_metadata(details) == {
        "work_package": {
            "full_test_name": "Ultraviolet Photoelectron Spectroscopy",
            "test_acronym": "UPS",
            "test_type": "Physicochemical characterisation",
            "endpoint": "Electronic structure",
            "endpoint_outcome": "Work function",
            "sop": "SOP-UPS-01",
        },
        "material": {"erm_id": "ERM-123"},
    }


def test_released_sections_respect_public_flags():
    test = Test(
        test_details={"visible": True}, raw_data={"secret": True}, final_results={"ok": True},
        release_test_details=True, release_raw_data=False, release_final_results=True,
        release_processed_data=False, release_statistical_analysis=False,
    )
    assert released_sections(test, private_access=False) == ["test_details", "final_results"]
    assert released_sections(test, private_access=True) == ["test_details", "raw_data", "final_results"]


@pytest.mark.parametrize(
    "release_field,data_field",
    [
        ("release_test_details", "test_details"),
        ("release_raw_data", "raw_data"),
        ("release_processed_data", "processed_data"),
        ("release_final_results", "final_results"),
        ("release_statistical_analysis", "statistical_analysis"),
    ],
)
def test_each_public_release_flag_exposes_only_its_matching_section(
    release_field: str, data_field: str
):
    now = datetime.now(timezone.utc)
    values = {
        "id": 9,
        "work_package_name": "WP3",
        "element_cms_id": "CMS-1",
        "test_name": "MTT",
        "is_public": True,
        "test_details": {"section": "test_details"},
        "raw_data": {"section": "raw_data"},
        "processed_data": {"section": "processed_data"},
        "final_results": {"section": "final_results"},
        "statistical_analysis": {"section": "statistical_analysis"},
        "created_at": now,
        "updated_at": now,
        **{field: field == release_field for field in RELEASE_FIELDS},
    }

    response = mask_test_for_public(Test(**values))

    for field in (
        "test_details",
        "raw_data",
        "processed_data",
        "final_results",
        "statistical_analysis",
    ):
        expected = {"section": field} if field == data_field else None
        if field == "test_details" and data_field != "test_details":
            expected = public_test_header_metadata(values["test_details"])
        assert getattr(response, field) == expected


@pytest.mark.parametrize("test_name", sorted(PARSERS))
@pytest.mark.parametrize(
    "release_field,data_field",
    [
        ("release_test_details", "test_details"),
        ("release_raw_data", "raw_data"),
        ("release_processed_data", "processed_data"),
        ("release_final_results", "final_results"),
        ("release_statistical_analysis", "statistical_analysis"),
    ],
)
def test_every_test_type_supports_each_release_flag_independently(
    test_name: str, release_field: str, data_field: str
):
    """All registered test types use the same fail-closed public projection."""
    now = datetime.now(timezone.utc)
    section_fields = (
        "test_details",
        "raw_data",
        "processed_data",
        "final_results",
        "statistical_analysis",
    )
    record = Test(
        id=9,
        work_package_name="WP-audit",
        element_cms_id="CMS-audit",
        test_name=test_name,
        is_public=True,
        created_at=now,
        updated_at=now,
        **{field: {"test_type": test_name, "section": field} for field in section_fields},
        **{field: field == release_field for field in RELEASE_FIELDS},
    )

    response = mask_test_for_public(record)

    assert response.test_name == test_name
    for field in section_fields:
        expected = {"test_type": test_name, "section": field} if field == data_field else None
        if field == "test_details" and data_field != "test_details":
            expected = public_test_header_metadata(record.test_details)
        assert getattr(response, field) == expected
    for field in RELEASE_FIELDS:
        assert getattr(response, field) is (field == release_field)


@pytest.mark.parametrize("enabled_flags", product((False, True), repeat=len(RELEASE_FIELDS)))
def test_all_release_flag_combinations_are_projected_independently(enabled_flags):
    """No release flag may enable, disable, or depend on another section."""
    now = datetime.now(timezone.utc)
    section_fields = (
        "test_details",
        "raw_data",
        "processed_data",
        "final_results",
        "statistical_analysis",
    )
    releases = dict(zip(RELEASE_FIELDS, enabled_flags))
    response = mask_test_for_public(
        Test(
            id=10,
            work_package_name="WP-audit",
            element_cms_id="CMS-combinations",
            test_name="MTT",
            is_public=True,
            created_at=now,
            updated_at=now,
            **{field: {"section": field} for field in section_fields},
            **releases,
        )
    )

    for release_field, data_field in zip(RELEASE_FIELDS, section_fields):
        assert getattr(response, release_field) is releases[release_field]
        expected = {"section": data_field} if releases[release_field] else None
        if data_field == "test_details" and not releases[release_field]:
            expected = public_test_header_metadata({"section": data_field})
        assert getattr(response, data_field) == expected


def test_parser_payload_maps_all_five_canonical_sections_independently():
    parsed = {
        "test_details": {"section": "test_details"},
        "replications": [{"section": "raw_data"}],
        "processed_data": {"section": "processed_data"},
        "final_results": {"section": "final_results"},
        "statistical_analysis": {"section": "statistical_analysis"},
    }

    assert build_payload_from_parse(parsed) == {
        "test_details": {"section": "test_details"},
        "raw_data": [{"section": "raw_data"}],
        "processed_data": {"section": "processed_data"},
        "final_results": {"section": "final_results"},
        "statistical_analysis": {"section": "statistical_analysis"},
    }


@pytest.mark.asyncio
async def test_public_listings_detail_branch_applies_release_projection():
    now = datetime.now(timezone.utc)
    record = Test(
        id=11,
        work_package_name="WP-audit",
        element_cms_id="CMS-listings",
        test_name="XRD",
        is_public=True,
        test_details={
            "work_package": {
                "full_test_name": "X-ray Diffraction",
                "test_acronym": "XRD",
                "test_type": "Characterisation",
                "endpoint": "Crystal structure",
                "endpoint_outcome": "Phase identification",
                "sop": "SOP-XRD-01",
                "partner": "withheld partner",
            },
            "material": {"erm_id": "ERM-XRD", "material_name": "withheld material"},
            "instrumentation": {"instrument_model": "withheld instrument"},
        },
        raw_data={"released": "raw"},
        processed_data={"secret": "processed"},
        final_results={"released": "results"},
        statistical_analysis={"secret": "statistics"},
        release_test_details=False,
        release_raw_data=True,
        release_processed_data=False,
        release_final_results=True,
        release_statistical_analysis=False,
        created_at=now,
        updated_at=now,
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = record
    db = AsyncMock()
    db.execute.return_value = result

    response = await TestService(db).get_listings(
        TestListings(
            work_package_name="WP-audit",
            element_cms_id="CMS-listings",
            test_name="XRD",
        ),
        is_private_user=False,
    )

    assert response.release_test_details is False
    assert response.test_details == {
        "work_package": {
            "full_test_name": "X-ray Diffraction",
            "test_acronym": "XRD",
            "test_type": "Characterisation",
            "endpoint": "Crystal structure",
            "endpoint_outcome": "Phase identification",
            "sop": "SOP-XRD-01",
        },
        "material": {"erm_id": "ERM-XRD"},
    }
    assert "partner" not in response.test_details["work_package"]
    assert "material_name" not in response.test_details["material"]
    assert "instrumentation" not in response.test_details
    assert response.raw_data == {"released": "raw"}
    assert response.processed_data is None
    assert response.final_results == {"released": "results"}
    assert response.statistical_analysis is None

def test_release_selection_defaults_closed_and_rejects_unknown_fields():
    assert not any(TestReleaseSelection().model_dump().values())
    with pytest.raises(ValidationError):
        TestReleaseSelection.model_validate({"release_uncontrolled_data": True})


def test_catalog_withholds_material_metadata_with_test_details():
    details = {
        "material": {
            "material_name": "Sensitive material",
            "material_identifier": "CMS-secret",
            "erm_id": "ERM-secret",
            "cas_no": "CAS-secret",
        }
    }

    assert catalog_material_metadata(details, released=False) == {
        "material_name": None,
        "cms_id": None,
        "erm_id": None,
        "cas_no": None,
    }
    assert catalog_material_metadata(details, released=True) == {
        "material_name": "Sensitive material",
        "cms_id": "CMS-secret",
        "erm_id": "ERM-secret",
        "cas_no": "CAS-secret",
    }


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