from security.auth import Principal
from security.tenant import get_tenant_db


class _FakeSession:
    def __init__(self):
        self.calls = []

    async def execute(self, statement, parameters=None):
        self.calls.append((str(statement), parameters or {}))


def _principal(all_tests: bool) -> Principal:
    return Principal(
        subject="api-client:cms_partner",
        email=None,
        organisation_id="",
        roles=frozenset({"service_account"}),
        scopes=frozenset({"tests:read"}),
        client_id="cms_partner",
        token_id=None,
        user_id=30,
        all_tests=all_tests,
    )


async def test_tenant_context_enables_test_only_rls_bypass_for_all_tests():
    session = _FakeSession()
    await get_tenant_db(_principal(all_tests=True), session)
    settings = {statement: values for statement, values in session.calls}
    all_tests_call = next(
        values for statement, values in settings.items() if "app.all_tests_access" in statement
    )
    platform_call = next(
        values for statement, values in settings.items() if "app.platform_governance" in statement
    )
    assert all_tests_call == {"enabled": "on"}
    assert platform_call == {"enabled": "off"}


async def test_tenant_context_disables_all_tests_access_by_default():
    session = _FakeSession()
    await get_tenant_db(_principal(all_tests=False), session)
    all_tests_call = next(
        values
        for statement, values in session.calls
        if "app.all_tests_access" in statement
    )
    assert all_tests_call == {"enabled": "off"}