from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from security import auth
from security.config import clear_settings_cache


PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PUBLIC_KEY = PRIVATE_KEY.public_key()


class FakeSigningKey:
    key = PUBLIC_KEY


class FakeJWKClient:
    def __init__(self, *_args, **_kwargs):
        pass

    def get_signing_key_from_jwt(self, _token):
        return FakeSigningKey()


def token(**overrides):
    now = datetime.now(timezone.utc)
    claims = {
        "sub": "user-1",
        "iss": "https://identity.example/realms/chemat-sustain",
        "aud": "chemat-api",
        "azp": "chemat-portal",
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "organisation_id": "org-1",
        "scope": "tests:read files:navigate",
        "realm_access": {"roles": ["researcher"]},
        "email": "researcher@example.org",
    }
    claims.update(overrides)
    return jwt.encode(claims, PRIVATE_KEY, algorithm="RS256", headers={"kid": "test"})


@pytest.fixture(autouse=True)
def fake_jwks(monkeypatch):
    clear_settings_cache()
    monkeypatch.setattr(auth, "PyJWKClient", FakeJWKClient)


def test_valid_token_becomes_tenant_principal():
    principal = auth.decode_access_token(token())
    assert principal.organisation_id == "org-1"
    assert principal.scopes == {"tests:read", "files:navigate"}
    assert "researcher" in principal.roles


@pytest.mark.parametrize(
    "override",
    [
        {"aud": "wrong-api"},
        {"iss": "https://attacker.example/realms/fake"},
        {"exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        {"azp": "unapproved-client"},
    ],
)
def test_rejects_forged_or_invalid_claims(override):
    with pytest.raises(HTTPException):
        auth.decode_access_token(token(**override))


@pytest.mark.parametrize("organisation_id", [None, "", "   "])
def test_missing_tenant_claim_is_denied(organisation_id):
    with pytest.raises(HTTPException) as error:
        auth.decode_access_token(token(organisation_id=organisation_id))
    assert error.value.status_code == 403


def test_machine_principal_has_no_email():
    principal = auth.decode_access_token(token(email=None, azp="chemat-app-test"))
    assert principal.is_machine
