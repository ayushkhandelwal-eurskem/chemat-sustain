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
    )


def _sql(expression) -> str:
    return str(
        expression.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_test_access_allows_owner_or_explicit_grant():
    sql = _sql(_test_access(_principal()))
    assert "tests.organisation_id = 'org-1'" in sql
    assert "organisation_test_access.test_id = tests.id" in sql
    assert "organisation_test_access.organisation_id = 'org-1'" in sql


def test_protocol_access_allows_owner_or_explicit_grant():
    sql = _sql(_protocol_access(_principal()))
    assert "protocols.organisation_id = 'org-1'" in sql
    assert "organisation_protocol_access.protocol_id = protocols.id" in sql
    assert "organisation_protocol_access.organisation_id = 'org-1'" in sql