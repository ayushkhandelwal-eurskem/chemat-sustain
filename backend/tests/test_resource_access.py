from sqlalchemy.dialects import postgresql

from api.models.test import Test
from api.models_tree import Protocol
from api.router_access_admin import ResourceAssignment, _grants_any_access
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


# --- ResourceAssignment audit attribution requirement ------------------------
#
# Regression test: production tests/protocols may have no owning organisation
# (organisation_id is NULL on every current test row), and audit_events is
# NOT NULL on organisation_id. Granting access without an explicit
# audit_organisation_id would let a user through authorization but crash the
# very first read with a 500 - exactly what happened before this was caught.

def test_grants_any_access_true_for_specific_test_ids():
    assert _grants_any_access(ResourceAssignment(test_ids=[1]))


def test_grants_any_access_true_for_all_tests_flag():
    assert _grants_any_access(ResourceAssignment(all_tests=True))


def test_grants_any_access_true_for_platform_tester_flag():
    assert _grants_any_access(ResourceAssignment(is_platform_tester=True))


def test_grants_any_access_false_for_empty_assignment():
    assert not _grants_any_access(ResourceAssignment())