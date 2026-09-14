from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, Request, Response

from api.controllers.user import _create_login_session, login, register
from api.schemas.user import LoginRequest, PublicRegistration, Role


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/users/login",
            "headers": [(b"user-agent", b"test-browser")],
            "client": ("127.0.0.1", 12345),
        }
    )


@pytest.mark.asyncio
async def test_public_viewer_password_login_creates_session_without_otp():
    user = SimpleNamespace(
        id=7,
        email="viewer@example.org",
        role=Role.public_viewer,
        is_active=True,
    )
    with patch(
        "api.controllers.user.authenticate_user", new=AsyncMock(return_value=user)
    ), patch(
        "api.controllers.user.send_otp", new=AsyncMock()
    ) as send_otp, patch(
        "api.controllers.user._create_login_session", new=AsyncMock()
    ) as create_login_session:
        result = await login(
            LoginRequest(email=user.email, password="correct-password"),
            request=_request(),
            response=Response(),
            db=AsyncMock(),
        )

    assert result.authenticated is True
    assert result.requires_otp is False
    assert result.role == Role.public_viewer
    create_login_session.assert_awaited_once()
    send_otp.assert_not_awaited()


@pytest.mark.parametrize("role", [Role.user, Role.admin])
@pytest.mark.asyncio
async def test_privileged_password_login_requires_otp_and_does_not_create_session(role: Role):
    user = SimpleNamespace(
        id=8,
        email="team@example.org",
        role=role,
        is_active=True,
    )
    with patch(
        "api.controllers.user.authenticate_user", new=AsyncMock(return_value=user)
    ), patch(
        "api.controllers.user.send_otp", new=AsyncMock(return_value=(True, "sent"))
    ) as send_otp, patch(
        "api.controllers.user._create_login_session", new=AsyncMock()
    ) as create_login_session:
        result = await login(
            LoginRequest(email=user.email, password="correct-password"),
            request=_request(),
            response=Response(),
            db=AsyncMock(),
        )

    assert result.authenticated is False
    assert result.requires_otp is True
    assert result.role == role
    send_otp.assert_awaited_once()
    create_login_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_invalid_password_creates_neither_session_nor_otp():
    with patch(
        "api.controllers.user.authenticate_user", new=AsyncMock(return_value=False)
    ), patch(
        "api.controllers.user.send_otp", new=AsyncMock()
    ) as send_otp, patch(
        "api.controllers.user._create_login_session", new=AsyncMock()
    ) as create_login_session:
        with pytest.raises(HTTPException) as error:
            await login(
                LoginRequest(email="viewer@example.org", password="wrong-password"),
                request=_request(),
                response=Response(),
                db=AsyncMock(),
            )

    assert error.value.status_code == 401
    send_otp.assert_not_awaited()
    create_login_session.assert_not_awaited()


@pytest.mark.asyncio
async def test_public_registration_signs_in_without_sending_otp():
    registration = PublicRegistration(
        name="Public Viewer",
        email="viewer@example.org",
        password="strong-password-123",
    )
    user = SimpleNamespace(
        id=9,
        email=str(registration.email),
        role=Role.public_viewer,
        is_active=True,
    )
    db = AsyncMock()
    with patch(
        "api.controllers.user.get_user_by_email", new=AsyncMock(return_value=None)
    ), patch(
        "api.controllers.user.register_public_viewer", new=AsyncMock(return_value=user)
    ), patch(
        "api.controllers.user.send_otp", new=AsyncMock()
    ) as send_otp, patch(
        "api.controllers.user._create_login_session", new=AsyncMock()
    ) as create_login_session:
        result = await register(
            registration,
            request=_request(),
            response=Response(),
            db=db,
        )

    assert result.authenticated is True
    assert result.requires_otp is False
    assert result.role == Role.public_viewer
    send_otp.assert_not_awaited()
    create_login_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_shared_login_session_uses_protected_cookie(monkeypatch):
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "true")
    user = SimpleNamespace(id=10, email="viewer@example.org")
    session = SimpleNamespace(session_id="not-a-real-session")
    response = Response()

    with patch(
        "api.controllers.user.update_last_activity", new=AsyncMock()
    ), patch(
        "api.controllers.user.create_session", new=AsyncMock(return_value=session)
    ):
        await _create_login_session(AsyncMock(), user, _request(), response)

    cookie = response.headers["set-cookie"].lower()
    assert "session_id=not-a-real-session" in cookie
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie
    assert "max-age=604800" in cookie