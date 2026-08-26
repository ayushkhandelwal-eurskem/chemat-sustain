from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pyotp
import pytest

from api.controllers.user import forgot_password, reset_password
from api.schemas.user import ForgotPasswordRequest, ResetPasswordRequest
from api.services.user import send_otp, verify_otp


@pytest.mark.asyncio
async def test_forgot_password_does_not_reveal_unknown_email():
    with patch("api.controllers.user.get_user_by_email", new=AsyncMock(return_value=None)), patch(
        "api.controllers.user.send_otp", new=AsyncMock()
    ) as deliver:
        response = await forgot_password(
            ForgotPasswordRequest(email="unknown@example.org"),
            db=AsyncMock(),
        )

    assert response.msg.startswith("If an active account exists")
    deliver.assert_not_awaited()


@pytest.mark.asyncio
async def test_forgot_password_sends_purpose_bound_reset_code_for_active_user():
    user = SimpleNamespace(is_active=True)
    with patch("api.controllers.user.get_user_by_email", new=AsyncMock(return_value=user)), patch(
        "api.controllers.user.send_otp", new=AsyncMock(return_value=(True, "sent"))
    ) as deliver:
        response = await forgot_password(
            ForgotPasswordRequest(email="user@example.org"),
            db=AsyncMock(),
        )

    assert response.msg.startswith("If an active account exists")
    deliver.assert_awaited_once_with(
        ANY,
        "user@example.org",
        purpose="password reset",
    )


@pytest.mark.asyncio
async def test_password_reset_requires_reset_purpose_and_changes_password():
    user = SimpleNamespace(is_active=True)
    request = ResetPasswordRequest(
        email="user@example.org",
        otp_code="123456",
        new_password="a-secure-new-password",
    )
    with patch("api.controllers.user.get_user_by_email", new=AsyncMock(return_value=user)), patch(
        "api.controllers.user.verify_otp", new=AsyncMock(return_value=True)
    ) as verify, patch(
        "api.controllers.user.change_password", new=AsyncMock(return_value=user)
    ) as change:
        response = await reset_password(request, db=AsyncMock())

    assert response.msg.startswith("Password reset successfully")
    verify.assert_awaited_once_with(
        ANY,
        "user@example.org",
        "123456",
        purpose="password reset",
    )
    change.assert_awaited_once_with(
        db=ANY,
        email="user@example.org",
        new_password="a-secure-new-password",
    )


@pytest.mark.asyncio
async def test_otp_cannot_be_reused_for_a_different_purpose():
    secret = pyotp.random_base32()
    user = SimpleNamespace(otp_secret=f"password reset:{secret}")
    code = pyotp.TOTP(secret, interval=300).now()
    db = AsyncMock()
    with patch("api.services.user.get_user_by_email", new=AsyncMock(return_value=user)):
        assert not await verify_otp(db, "user@example.org", code, purpose="sign-in")
        assert await verify_otp(db, "user@example.org", code, purpose="password reset")

    assert user.otp_secret is None


@pytest.mark.asyncio
async def test_otp_sender_defaults_to_database_address(monkeypatch):
    monkeypatch.delenv("SMTP_SENDER", raising=False)
    monkeypatch.setenv("SMTP_USERNAME", "smtp-account")
    monkeypatch.setenv("SMTP_PASSWORD", "test-password")
    user = SimpleNamespace(otp_secret=None)
    db = AsyncMock()
    smtp = MagicMock()
    smtp.__enter__.return_value = smtp

    with patch("api.services.user.get_user_by_email", new=AsyncMock(return_value=user)), patch(
        "api.services.user.smtplib.SMTP", return_value=smtp
    ):
        success, _message = await send_otp(db, "user@example.org")

    assert success
    assert user.otp_secret.startswith("sign-in:")
    sent_message = smtp.sendmail.call_args.args[2]
    assert "From: database@eurskem.com" in sent_message