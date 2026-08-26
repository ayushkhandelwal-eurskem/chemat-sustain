from sqlalchemy.dialects import postgresql

from api.models.test import Test
from api.models_tree import Protocol
from api.router_phase1 import _protocol_access, _test_access
from security.auth import Principal


def _principal() -> Principal:
    return Principal(
        subject="api-client:cms_test",
        email=None,
        organisation_id="org-1",
        roles=frozenset({"service_account"}),
        scopes=frozenset({"tests:read", "protocols:read"}),
        client_id="cms_test",
        token_id=None,
        user_id=42,
    )


def _sql(expression) -> str:
    return str(
        expression.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_test_access_uses_explicit_user_grant():
    sql = _sql(_test_access(_principal()))
    assert "user_test_access.test_id = tests.id" in sql
    assert "user_test_access.user_id = 42" in sql


def test_protocol_access_uses_explicit_user_grant():
    sql = _sql(_protocol_access(_principal()))
    assert "user_protocol_access.protocol_id = protocols.id" in sql
    assert "user_protocol_access.user_id = 42" in sql