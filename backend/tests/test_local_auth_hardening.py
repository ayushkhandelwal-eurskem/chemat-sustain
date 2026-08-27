from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import api.controllers.file_navigator as navigator
from api.schemas.user import ChangePasswordRequest, LoginRequest, UserCreate


def test_file_navigator_rejects_path_escape(tmp_path: Path, monkeypatch):
    root = tmp_path / "data"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setattr(navigator, "BASE_DIR", root)

    with pytest.raises(HTTPException):
        navigator.resolve_beneath(navigator.BASE_DIR, "..", "outside")


def test_file_navigator_rejects_symlink_escape(tmp_path: Path, monkeypatch):
    root = tmp_path / "data"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (outside / "secret.xlsx").write_bytes(b"not research data")
    (root / "escape").symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(navigator, "BASE_DIR", root)

    with pytest.raises(HTTPException):
        navigator.resolve_beneath(navigator.BASE_DIR, "escape", "secret.xlsx")


@pytest.mark.parametrize("length", [0, 73])
def test_login_password_length_is_bounded(length: int):
    with pytest.raises(ValidationError):
        LoginRequest(email="user@example.org", password="x" * length)


@pytest.mark.parametrize("model", [UserCreate, ChangePasswordRequest])
def test_new_passwords_require_twelve_characters(model):
    data = {"email": "user@example.org", "password": "short", "role": "user"}
    if model is ChangePasswordRequest:
        data = {"email": "user@example.org", "new_password": "short"}
    with pytest.raises(ValidationError):
        model(**data)