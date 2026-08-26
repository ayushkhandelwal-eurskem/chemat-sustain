from security.audit import append_audit_event, event_digest
from security.auth import Principal


def test_audit_digest_is_deterministic():
    payload = {"action": "read", "resource_id": "1", "metadata": {"b": 2, "a": 1}}
    assert event_digest("GENESIS", payload, "key") == event_digest("GENESIS", payload, "key")


def test_audit_digest_detects_payload_tampering():
    original = event_digest("GENESIS", {"outcome": "denied"}, "key")
    tampered = event_digest("GENESIS", {"outcome": "success"}, "key")
    assert original != tampered


def test_audit_digest_detects_chain_tampering():
    payload = {"outcome": "success"}
    assert event_digest("hash-one", payload, "key") != event_digest("hash-two", payload, "key")


def test_audit_digest_depends_on_secret_key():
    payload = {"outcome": "success"}
    assert event_digest("GENESIS", payload, "key-one") != event_digest("GENESIS", payload, "key-two")


# --- append_audit_event construction -----------------------------------------
#
# Regression test: occurred_at was passed to AuditEvent() twice - once via the
# **payload expansion (isoformat string) and once explicitly (datetime) -
# raising TypeError: got multiple values for keyword argument 'occurred_at'.
# That made every endpoint which audits a read (experimental-data, protocol
# download, portal actions) return 500.

class _FakeResult:
    def scalar_one_or_none(self):
        return None


class _FakeSession:
    """Minimal AsyncSession stand-in: no previous event, add/flush are no-ops."""

    def __init__(self):
        self.added = None
        self.statements = []

    async def execute(self, statement, *_args, **_kwargs):
        self.statements.append(str(statement))
        return _FakeResult()

    def add(self, obj):
        self.added = obj

    async def flush(self):
        pass


async def test_append_audit_event_constructs_event():
    import os
    os.environ.setdefault("AUDIT_HMAC_KEY", "test-key")
    principal = Principal(
        subject="api-client:cms_test",
        email=None,
        organisation_id="org-1",
        roles=frozenset({"service_account"}),
        scopes=frozenset({"tests:read"}),
        client_id="cms_test",
        token_id=None,
    )
    session = _FakeSession()
    event = await append_audit_event(
        session, principal, "experimental_data.read", "test", "2", "success"
    )
    assert event.organisation_id == "org-1"
    assert event.sequence == 1
    assert event.previous_hash == "GENESIS"
    assert event.event_hash and event.event_hash != "GENESIS"
    assert session.added is event
    assert "pg_advisory_xact_lock" in session.statements[0]


async def test_append_audit_event_can_use_resource_owner_organisation():
    principal = Principal(
        subject="api-client:cms_platform",
        email="tester@eurskem.com",
        organisation_id="",
        roles=frozenset({"service_account"}),
        scopes=frozenset({"experimental-data:read"}),
        client_id="cms_platform",
        token_id=None,
        user_id=22,
        is_platform_tester=True,
        audit_organisation_id="eurskem-org",
    )
    event = await append_audit_event(
        _FakeSession(),
        principal,
        "experimental_data.read",
        "test",
        "2",
        "success",
        organisation_id="resource-owner-org",
    )
    assert event.organisation_id == "resource-owner-org"

    ownerless_event = await append_audit_event(
        _FakeSession(),
        principal,
        "experimental_data.read",
        "test",
        "3",
        "success",
    )
    assert ownerless_event.organisation_id == "eurskem-org"
