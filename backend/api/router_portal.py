"""Developer Portal APIs: catalogue, applications, approvals, grants and audit."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.security import (
    ActiveGrant,
    ApiDefinition,
    ApprovalDecision,
    ApprovalRole,
    AuditEvent,
    DeveloperApplication,
    AccessRequest,
    RequestStatus,
)
from api.schemas.portal import AccessRequestCreate, ApplicationCreate, ApprovalCreate, RevokeCreate
from security.audit import append_audit_event
from security.auth import Principal, get_principal, require_roles, require_scopes
from security.keycloak_admin import KeycloakProvisioner
from security.tenant import get_tenant_db


router = APIRouter(prefix="/v1/portal", tags=["Developer Portal"])
APPROVAL_ROLES = {
    "api_owner": ApprovalRole.api_owner,
    "data_owner": ApprovalRole.data_owner,
    "security_approver": ApprovalRole.security_approver,
}


@router.get("/me")
async def me(principal: Principal = Depends(get_principal)):
    return {
        "subject": principal.subject,
        "email": principal.email,
        "organisation_id": principal.organisation_id,
        "roles": sorted(principal.roles),
        "scopes": sorted(principal.scopes),
        "client_id": principal.client_id,
    }


@router.get("/catalog")
async def catalogue(
    _: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_tenant_db),
):
    definitions = (await db.execute(select(ApiDefinition).where(ApiDefinition.is_active.is_(True)))).scalars().all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "version": item.version,
            "description": item.description,
            "classification": item.classification,
            "scopes": item.scopes,
        }
        for item in definitions
    ]


@router.get("/applications")
async def list_applications(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_tenant_db),
):
    records = (
        await db.execute(
            select(DeveloperApplication)
            .where(DeveloperApplication.organisation_id == principal.organisation_id)
            .order_by(DeveloperApplication.created_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "owner_subject": item.owner_subject,
            "client_id": item.keycloak_client_id,
            "credential_version": item.credential_version,
            "is_active": item.is_active,
            "created_at": item.created_at,
        }
        for item in records
    ]


@router.post("/applications", status_code=status.HTTP_201_CREATED)
async def create_application(
    body: ApplicationCreate,
    principal: Principal = Depends(require_roles("developer", "organisation_admin", "platform_admin")),
    db: AsyncSession = Depends(get_tenant_db),
):
    record = DeveloperApplication(
        organisation_id=principal.organisation_id,
        name=body.name,
        description=body.description,
        owner_subject=principal.subject,
    )
    db.add(record)
    try:
        await db.flush()
        await append_audit_event(db, principal, "application.create", "developer_application", record.id, "success")
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Application name already exists") from exc
    return {"id": record.id, "name": record.name, "is_active": record.is_active}


@router.get("/access-requests")
async def list_access_requests(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_tenant_db),
):
    query = select(AccessRequest).where(AccessRequest.organisation_id == principal.organisation_id)
    if not principal.roles.intersection({"api_owner", "data_owner", "security_approver", "platform_admin"}):
        query = query.where(AccessRequest.requested_by == principal.subject)
    records = (await db.execute(query.order_by(AccessRequest.created_at.desc()))).scalars().all()
    return [
        {
            "id": item.id,
            "application_id": item.application_id,
            "requested_scopes": item.requested_scopes,
            "justification": item.justification,
            "requested_by": item.requested_by,
            "status": item.status.value,
            "expires_at": item.expires_at,
            "created_at": item.created_at,
        }
        for item in records
    ]


@router.post("/access-requests", status_code=status.HTTP_201_CREATED)
async def create_access_request(
    body: AccessRequestCreate,
    principal: Principal = Depends(require_roles("developer", "organisation_admin", "platform_admin")),
    db: AsyncSession = Depends(get_tenant_db),
):
    application = (
        await db.execute(
            select(DeveloperApplication).where(
                DeveloperApplication.id == body.application_id,
                DeveloperApplication.organisation_id == principal.organisation_id,
                DeveloperApplication.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    if application.owner_subject != principal.subject and "organisation_admin" not in principal.roles and "platform_admin" not in principal.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the application owner can request access")

    request = AccessRequest(
        organisation_id=principal.organisation_id,
        application_id=application.id,
        requested_scopes=body.requested_scopes,
        justification=body.justification,
        requested_by=principal.subject,
        expires_at=body.expires_at,
    )
    db.add(request)
    await db.flush()
    await append_audit_event(
        db,
        principal,
        "access_request.create",
        "access_request",
        request.id,
        "success",
        {"scopes": body.requested_scopes},
    )
    await db.commit()
    return {"id": request.id, "status": request.status.value}


@router.post("/access-requests/{request_id}/approvals/{approval_role}")
async def decide_access_request(
    request_id: str,
    approval_role: str,
    body: ApprovalCreate,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_tenant_db),
):
    role = APPROVAL_ROLES.get(approval_role)
    if role is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approval role not found")
    if approval_role not in principal.roles and "platform_admin" not in principal.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This approval role is required")

    request = (
        await db.execute(
            select(AccessRequest)
            .where(
                AccessRequest.id == request_id,
                AccessRequest.organisation_id == principal.organisation_id,
                AccessRequest.status == RequestStatus.pending,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pending request not found")

    decision = ApprovalDecision(
        organisation_id=principal.organisation_id,
        access_request_id=request.id,
        approval_role=role,
        decision=body.decision,
        reason=body.reason,
        actor_subject=principal.subject,
    )
    db.add(decision)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This approval role already decided") from exc

    if body.decision == "rejected":
        request.status = RequestStatus.rejected
    else:
        decisions = (
            await db.execute(
                select(ApprovalDecision).where(
                    ApprovalDecision.access_request_id == request.id,
                    ApprovalDecision.decision == "approved",
                )
            )
        ).scalars().all()
        approved_roles = {item.approval_role for item in decisions}
        if set(APPROVAL_ROLES.values()).issubset(approved_roles):
            request.status = RequestStatus.approved
            db.add(
                ActiveGrant(
                    organisation_id=principal.organisation_id,
                    access_request_id=request.id,
                    application_id=request.application_id,
                    scopes=request.requested_scopes,
                    issued_by=principal.subject,
                    expires_at=request.expires_at,
                )
            )

    await append_audit_event(
        db,
        principal,
        "access_request.approve" if body.decision == "approved" else "access_request.reject",
        "access_request",
        request.id,
        "success",
        {"approval_role": approval_role, "reason": body.reason},
    )
    await db.commit()
    return {"id": request.id, "status": request.status.value}


@router.post("/applications/{application_id}/credentials/rotate")
async def rotate_credentials(
    application_id: str,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_tenant_db),
):
    application = (
        await db.execute(
            select(DeveloperApplication).where(
                DeveloperApplication.id == application_id,
                DeveloperApplication.organisation_id == principal.organisation_id,
                DeveloperApplication.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    if application.owner_subject != principal.subject and "organisation_admin" not in principal.roles and "platform_admin" not in principal.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the application owner can rotate credentials")
    grant = (
        await db.execute(
            select(ActiveGrant).where(
                ActiveGrant.application_id == application.id,
                ActiveGrant.organisation_id == principal.organisation_id,
                ActiveGrant.revoked_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if grant is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No active grant exists")

    client_id, client_secret = await KeycloakProvisioner().ensure_client(
        application.id, principal.organisation_id, grant.scopes
    )
    application.keycloak_client_id = client_id
    application.credential_version += 1
    await append_audit_event(
        db,
        principal,
        "credential.rotate",
        "developer_application",
        application.id,
        "success",
        {"credential_version": application.credential_version},
    )
    await db.commit()
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "display_once": True,
        "credential_version": application.credential_version,
    }


@router.post("/grants/{grant_id}/revoke")
async def revoke_grant(
    grant_id: str,
    body: RevokeCreate,
    principal: Principal = Depends(require_roles("security_approver", "platform_admin")),
    db: AsyncSession = Depends(get_tenant_db),
):
    grant = (
        await db.execute(
            select(ActiveGrant).where(
                ActiveGrant.id == grant_id,
                ActiveGrant.organisation_id == principal.organisation_id,
                ActiveGrant.revoked_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if grant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Active grant not found")
    application = (
        await db.execute(select(DeveloperApplication).where(DeveloperApplication.id == grant.application_id))
    ).scalar_one()
    if application.keycloak_client_id:
        await KeycloakProvisioner().disable_client(application.keycloak_client_id)

    from datetime import datetime, timezone

    grant.revoked_at = datetime.now(timezone.utc)
    grant.revoked_by = principal.subject
    grant.revocation_reason = body.reason
    await append_audit_event(
        db, principal, "grant.revoke", "active_grant", grant.id, "success", {"reason": body.reason}
    )
    await db.commit()
    return {"id": grant.id, "revoked": True}


@router.get("/audit")
async def organisation_audit(
    principal: Principal = Depends(require_scopes("audit:read-own-organisation")),
    db: AsyncSession = Depends(get_tenant_db),
    limit: int = 100,
):
    limit = min(max(limit, 1), 500)
    events = (
        await db.execute(
            select(AuditEvent)
            .where(AuditEvent.organisation_id == principal.organisation_id)
            .order_by(AuditEvent.sequence.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [
        {
            "event_id": item.event_id,
            "sequence": item.sequence,
            "actor_subject": item.actor_subject,
            "action": item.action,
            "resource_type": item.resource_type,
            "resource_id": item.resource_id,
            "outcome": item.outcome,
            "occurred_at": item.occurred_at,
            "metadata": item.event_metadata,
            "previous_hash": item.previous_hash,
            "event_hash": item.event_hash,
        }
        for item in events
    ]
