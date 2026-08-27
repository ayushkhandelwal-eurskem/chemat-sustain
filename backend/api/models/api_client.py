"""Self-contained API credentials for partner machine access.

An administrator issues a separate client_id/client_secret pair for each partner
integration. Scope, user and organisation assignments are enforced on every
request.

Only a HASH of the secret is stored. The plaintext is returned exactly once, at
creation, and cannot be recovered afterwards - if a partner loses it, issue a new
one. That is a requirement of this project, not a stylistic choice.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, func

from utils.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class ApiClient(Base):
    __tablename__ = "api_clients"

    id = Column(String(36), primary_key=True, default=_uuid)

    # Public identifier, safe to log and to put in a support ticket.
    client_id = Column(String(64), nullable=False, unique=True, index=True)

    # bcrypt hash of the secret, via the same CryptContext used for user
    # passwords. Never the secret itself.
    client_secret_hash = Column(String(255), nullable=False)

    # Human label, e.g. "University of Lodz - data pipeline".
    name = Column(String(160), nullable=False)

    # Tenant this credential acts for. Every request it makes is scoped to this
    # organisation, and it is what lands in Principal.organisation_id, so it
    # drives tenant context and row-level security.
    #
    # Nullable only because organisations may not be populated yet; a client
    # without one can authenticate but sees no tenant-scoped rows.
    organisation_id = Column(String(36), ForeignKey("organisations.id"), nullable=True, index=True)

    # The partner user this credential was issued for. Adding a user and giving
    # them API access are then the same operation, and revoking a person's
    # access means disabling their keys too - without this link there is no way
    # to answer "which credentials belong to this person?" at offboarding.
    #
    # Nullable: a credential may belong to a partner SYSTEM with no human owner.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # e.g. ["tests:read", "protocols:read"]. Checked by require_scopes().
    scopes = Column(JSON, nullable=False, default=list)

    # The enable/disable switch. Disabling takes effect on the next request -
    # there is no token to expire, which is one practical advantage over the
    # bearer-token path.
    is_active = Column(Boolean, nullable=False, default=True)

    note = Column(Text, nullable=False, default="")
    created_by = Column(String(160), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    # Incremented on rotation, so an audit trail can distinguish generations of
    # the same logical credential.
    secret_version = Column(Integer, nullable=False, default=1)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ApiClient(client_id={self.client_id!r}, active={self.is_active})"
