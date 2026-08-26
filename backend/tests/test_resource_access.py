from sqlalchemy.dialects import postgresql

from api.models.test import Test
from api.models_tree import Protocol
from api.router_access_admin import ResourceAssignment, _grants_any_access
from api.router_phase1 import (
    _protocol_access,
    _test_access,
    _test_detail_payload,
    _test_index_query,
)
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


def test_all_tests_access_does_not_materialise_current_test_ids():
    principal = _principal()
    principal = Principal(
        **{**principal.__dict__, "all_tests": True}
    )
    # SQL true means every row selected from the live tests table passes the
    # application filter—including rows inserted after this profile was set.
    assert _sql(_test_access(principal)) == "true"


def test_protocol_access_uses_explicit_user_grant():
    sql = _sql(_protocol_access(_principal()))
    assert "user_protocol_access.protocol_id = protocols.id" in sql
    assert "user_protocol_access.user_id = 42" in sql


def test_index_is_unlimited_and_selects_only_lookup_fields():
    sql = _sql(_test_index_query(_principal()))
    assert "LIMIT" not in sql.upper()
    assert "tests.id AS test_id" in sql
    assert "tests.test_name AS test_name" in sql
    assert "tests.work_package_name AS work_package" in sql
    assert "tests.element_cms_id AS identifier" in sql
    assert "tests.raw_data" not in sql
    assert "user_test_access.user_id = 42" in sql


def test_index_filters_test_name_case_insensitively_and_test_id():
    sql = _sql(
        _test_index_query(_principal(), test_name=" mtt ", test_id=3)
    )
    assert "upper(tests.test_name) = 'MTT'" in sql
    assert "tests.id = 3" in sql


def test_index_all_tests_reads_live_table_without_explicit_grants():
    principal = Principal(**{**_principal().__dict__, "all_tests": True})
    sql = _sql(_test_index_query(principal))
    assert "user_test_access" not in sql
    assert "FROM tests" in sql
    assert "LIMIT" not in sql.upper()


def test_test_detail_payload_has_lookup_and_full_data_fields():
    record = Test(
        id=3,
        test_name="MTT",
        work_package_name="WP3",
        element_cms_id="CMS_4a_AuNP",
        test_details={"detail": True},
        raw_data={"raw": True},
        processed_data={"processed": True},
        final_results={"final": True},
        statistical_analysis={"statistics": True},
    )
    payload = _test_detail_payload(record)
    assert payload["test_id"] == 3
    assert payload["test_name"] == "MTT"
    assert payload["work_package"] == "WP3"
    assert payload["identifier"] == "CMS_4a_AuNP"
    assert payload["raw_data"] == {"raw": True}
    assert "id" not in payload


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