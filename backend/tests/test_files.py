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
