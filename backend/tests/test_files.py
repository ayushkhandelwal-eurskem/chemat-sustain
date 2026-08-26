from pathlib import Path

import pytest
from fastapi import HTTPException
from hypothesis import given, strategies as st

from security.files import resolve_beneath, safe_filename


def test_resolves_normal_file(tmp_path: Path):
    root = tmp_path / "tenant"
    root.mkdir()
    target = root / "result.txt"
    target.write_text("safe")
    assert resolve_beneath(root, "result.txt") == target


@pytest.mark.parametrize("value", ["..", ".", "/etc/passwd", "\x00", "../secret", "..\\secret"])
def test_rejects_unsafe_path_component(tmp_path: Path, value: str):
    root = tmp_path / "tenant"
    root.mkdir()
    with pytest.raises(HTTPException):
        resolve_beneath(root, value)


def test_rejects_symlink_escape(tmp_path: Path):
    root = tmp_path / "tenant"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (outside / "secret.txt").write_text("secret")
    (root / "escape").symlink_to(outside, target_is_directory=True)
    with pytest.raises(HTTPException):
        resolve_beneath(root, "escape", "secret.txt")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ('report".pdf', "report.pdf"),
        ("../report.pdf", "report.pdf"),
        ("line\r\nbreak.pdf", "linebreak.pdf"),
        ("", "download"),
    ],
)
def test_safe_filename(value: str, expected: str):
    assert safe_filename(value) == expected


@given(st.text(max_size=300))
def test_safe_filename_never_contains_header_breaks(value: str):
    result = safe_filename(value)
    assert "\r" not in result
    assert "\n" not in result
    assert "\x00" not in result
    assert '"' not in result
    assert len(result) <= 180


# --- /v1/files listing -------------------------------------------------------
#
# Regression tests for the 500 (and the shared-root leak) found while testing
# a production API credential: an organisation that never stored a file has
# no tenant directory yet, and Path.resolve(strict=True) raised an unhandled
# FileNotFoundError. An organisation-less credential must not fall back to the
# shared data root - the Keycloak path already denies those with 403
# (test_auth.test_missing_tenant_claim_is_denied), so the API-key path must
# match.

import api.router_phase1 as phase1  # noqa: E402
from security.auth import Principal  # noqa: E402


class _Settings:
    """Minimal settings stand-in: navigate_files only reads tenant_data_root."""

    def __init__(self, root: Path):
        self.tenant_data_root = str(root)


def _principal(organisation_id: str) -> Principal:
    return Principal(
        subject="api-client:cms_test",
        email=None,
        organisation_id=organisation_id,
        roles=frozenset({"service_account"}),
        scopes=frozenset({"files:navigate"}),
        client_id="cms_test",
        token_id=None,
    )


def test_resolve_beneath_missing_root_returns_404(tmp_path: Path):
    with pytest.raises(HTTPException) as error:
        resolve_beneath(tmp_path / "never-created", "file.txt")
    assert error.value.status_code == 404


async def test_files_listing_empty_for_organisation_without_directory(
    tmp_path: Path, monkeypatch
):
    monkeypatch.setattr(phase1, "get_settings", lambda: _Settings(tmp_path))
    # platform_org=None must be explicit: the parameter's FastAPI default is
    # a Depends marker, which direct calls would otherwise treat as "operator".
    assert await phase1.navigate_files("", _principal("org-1"), platform_org=None) == []


async def test_files_listing_denies_organisationless_credential(
    tmp_path: Path, monkeypatch
):
    monkeypatch.setattr(phase1, "get_settings", lambda: _Settings(tmp_path))
    with pytest.raises(HTTPException) as error:
        await phase1.navigate_files("", _principal(""), platform_org=None)
    assert error.value.status_code == 403


async def test_files_listing_lists_tenant_entries(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(phase1, "get_settings", lambda: _Settings(tmp_path))
    org_dir = tmp_path / "org-1"
    (org_dir / "sub").mkdir(parents=True)
    (org_dir / "report.txt").write_text("data")
    listing = await phase1.navigate_files("", _principal("org-1"), platform_org=None)
    assert [(item["name"], item["type"]) for item in listing] == [
        ("sub", "directory"),
        ("report.txt", "file"),
    ]


# --- Platform operator (PLATFORM_OPERATOR_ORG_SLUG) --------------------------
#
# The operator organisation's credentials read across every tenant; everyone
# else keeps strict tenant scope. platform_org is the resolved operator org
# id - None means "caller is not the operator".

async def test_platform_operator_sees_all_tenant_roots(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(phase1, "get_settings", lambda: _Settings(tmp_path))
    (tmp_path / "org-1").mkdir()
    (tmp_path / "org-2").mkdir()
    listing = await phase1.navigate_files(
        "", _principal("operator"), platform_org="operator"
    )
    assert [item["name"] for item in listing] == ["org-1", "org-2"]


async def test_platform_operator_can_descend_into_tenant_directory(
    tmp_path: Path, monkeypatch
):
    monkeypatch.setattr(phase1, "get_settings", lambda: _Settings(tmp_path))
    (tmp_path / "org-2").mkdir()
    (tmp_path / "org-2" / "data.txt").write_text("x")
    listing = await phase1.navigate_files(
        "org-2", _principal("operator"), platform_org="operator"
    )
    assert [(item["name"], item["type"]) for item in listing] == [
        ("data.txt", "file")
    ]


async def test_non_operator_stays_scoped_to_own_directory(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(phase1, "get_settings", lambda: _Settings(tmp_path))
    (tmp_path / "org-1").mkdir()
    (tmp_path / "org-2").mkdir()
    # platform_org=None: a partner sees only its own area, not org-2.
    listing = await phase1.navigate_files("", _principal("org-1"), platform_org=None)
    assert listing == []


async def test_platform_operator_with_missing_root_returns_empty(
    tmp_path: Path, monkeypatch
):
    monkeypatch.setattr(
        phase1, "get_settings", lambda: _Settings(tmp_path / "no-such-root")
    )
    assert (
        await phase1.navigate_files("", _principal("operator"), platform_org="operator")
        == []
    )
