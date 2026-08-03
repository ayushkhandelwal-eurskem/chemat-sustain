from security.audit import event_digest


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
