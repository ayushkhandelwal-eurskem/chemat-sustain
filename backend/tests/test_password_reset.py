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
async def test_otp_sender_defaults_to_accessible_workspace_address(monkeypatch):
    monkeypatch.delenv("SMTP_SENDER", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_PORT", raising=False)
    monkeypatch.delenv("SMTP_SECURITY", raising=False)
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.setenv("SMTP_PASSWORD", "test-password")
    user = SimpleNamespace(otp_secret=None)
    db = AsyncMock()
    smtp = MagicMock()
    smtp.__enter__.return_value = smtp

    with patch("api.services.user.get_user_by_email", new=AsyncMock(return_value=user)), patch(
        "api.services.user.smtplib.SMTP", return_value=smtp
    ) as starttls_connection:
        success, _message = await send_otp(db, "user@example.org")

    assert success
    assert user.otp_secret.startswith("sign-in:")
    starttls_connection.assert_called_once_with("smtp.gmail.com", 587, timeout=10)
    smtp.login.assert_called_once_with("ayush.khandelwal@eurskem.com", "test-password")
    smtp.starttls.assert_called_once_with()
    sent_message = smtp.sendmail.call_args.args[2]
    assert "From: ayush.khandelwal@eurskem.com" in sent_message


@pytest.mark.asyncio
async def test_otp_supports_starttls_for_non_cloudflare_provider(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_SECURITY", "starttls")
    monkeypatch.setenv("SMTP_SENDER", "database@example.org")
    monkeypatch.setenv("SMTP_USERNAME", "smtp-user")
    monkeypatch.setenv("SMTP_PASSWORD", "test-password")
    user = SimpleNamespace(otp_secret=None)
    smtp = MagicMock()
    smtp.__enter__.return_value = smtp

    with patch("api.services.user.get_user_by_email", new=AsyncMock(return_value=user)), patch(
        "api.services.user.smtplib.SMTP", return_value=smtp
    ) as starttls_connection:
        success, _message = await send_otp(AsyncMock(), "user@example.org")

    assert success
    starttls_connection.assert_called_once_with("smtp.example.org", 587, timeout=10)
    smtp.starttls.assert_called_once_with()


@pytest.mark.asyncio
async def test_otp_rejects_unknown_smtp_security_mode(monkeypatch):
    monkeypatch.setenv("SMTP_SECURITY", "plaintext")
    monkeypatch.setenv("SMTP_PASSWORD", "test-password")
    user = SimpleNamespace(otp_secret=None)

    with patch("api.services.user.get_user_by_email", new=AsyncMock(return_value=user)), patch(
        "api.services.user.smtplib.SMTP_SSL"
    ) as smtp_ssl, patch("api.services.user.smtplib.SMTP") as smtp:
        success, message = await send_otp(AsyncMock(), "user@example.org")

    assert not success
    assert message == "OTP delivery is temporarily unavailable"
    smtp_ssl.assert_not_called()
    smtp.assert_not_called()