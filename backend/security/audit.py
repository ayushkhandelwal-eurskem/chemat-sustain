"""Append-only, HMAC-chained security audit events."""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.security import AuditEvent
from security.auth import Principal
from security.config import get_settings


def canonical_event(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()


def event_digest(previous_hash: str, payload: dict[str, Any], key: str) -> str:
    return hmac.new(key.encode(), previous_hash.encode() + canonical_event(payload), hashlib.sha256).hexdigest()


async def append_audit_event(
    db: AsyncSession,
    principal: Principal,
    action: str,
    resource_type: str,
    resource_id: str | None,
    outcome: str,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    previous = (
        await db.execute(
            select(AuditEvent)
            .where(AuditEvent.organisation_id == principal.organisation_id)
            .order_by(AuditEvent.sequence.desc())
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()
    sequence = (previous.sequence + 1) if previous else 1
    previous_hash = previous.event_hash if previous else "GENESIS"
    occurred_at = datetime.now(timezone.utc)
    event_id = str(uuid4())
    payload = {
        "event_id": event_id,
        "organisation_id": principal.organisation_id,
        "sequence": sequence,
        "actor_subject": principal.subject,
        "actor_client_id": principal.client_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "outcome": outcome,
        "occurred_at": occurred_at.isoformat(),
        "metadata": metadata or {},
    }
    event = AuditEvent(
        # occurred_at is passed explicitly below (as a datetime, not the
        # isoformat string in the payload), so it must be excluded here -
        # passing both raises "got multiple values for keyword argument".
        **{key: value for key, value in payload.items() if key not in ("metadata", "occurred_at")},
        event_metadata=payload["metadata"],
        occurred_at=occurred_at,
        previous_hash=previous_hash,
        event_hash=event_digest(previous_hash, payload, get_settings().audit_hmac_key),
    )
    db.add(event)
    await db.flush()
    return event
