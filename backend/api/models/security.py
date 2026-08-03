"""SQLAlchemy models for tenant, developer-access, and audit workflows."""

from __future__ import annotations

import enum
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from utils.db import Base


def uuid_string() -> str:
    return str(uuid4())


class RequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    revoked = "revoked"


class ApprovalRole(str, enum.Enum):
    api_owner = "api_owner"
    data_owner = "data_owner"
    security_approver = "security_approver"


class Organisation(Base):
    __tablename__ = "organisations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrganisationMembership(Base):
    __tablename__ = "organisation_memberships"
    __table_args__ = (UniqueConstraint("organisation_id", "keycloak_subject"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    keycloak_subject: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(320))
    roles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ApiDefinition(Base):
    __tablename__ = "api_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    classification: Mapped[str] = mapped_column(String(40), nullable=False, default="consortium")
    scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class DeveloperApplication(Base):
    __tablename__ = "developer_applications"
    __table_args__ = (UniqueConstraint("organisation_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    owner_subject: Mapped[str] = mapped_column(String(120), nullable=False)
    keycloak_client_id: Mapped[str | None] = mapped_column(String(160), unique=True)
    credential_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("developer_applications.id"), nullable=False)
    requested_scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    requested_by: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus), nullable=False, default=RequestStatus.pending)
    expires_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApprovalDecision(Base):
    __tablename__ = "approval_decisions"
    __table_args__ = (UniqueConstraint("access_request_id", "approval_role"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    access_request_id: Mapped[str] = mapped_column(ForeignKey("access_requests.id"), nullable=False)
    approval_role: Mapped[ApprovalRole] = mapped_column(Enum(ApprovalRole), nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    actor_subject: Mapped[str] = mapped_column(String(120), nullable=False)
    decided_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ActiveGrant(Base):
    __tablename__ = "active_grants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    access_request_id: Mapped[str] = mapped_column(ForeignKey("access_requests.id"), nullable=False, unique=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("developer_applications.id"), nullable=False)
    scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    issued_by: Mapped[str] = mapped_column(String(120), nullable=False)
    issued_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[object | None] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[str | None] = mapped_column(String(120))
    revocation_reason: Mapped[str | None] = mapped_column(Text)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (UniqueConstraint("organisation_id", "sequence"),)

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_subject: Mapped[str] = mapped_column(String(120), nullable=False)
    actor_client_id: Mapped[str | None] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(160))
    outcome: Mapped[str] = mapped_column(String(30), nullable=False)
    occurred_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=False)
    event_metadata: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False)
