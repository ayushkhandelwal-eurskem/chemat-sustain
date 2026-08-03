"""Admin-only management for users, organisations, and tenant data assignment."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.api_client import ApiClient
from api.models.security import (
    AccessRequest,
    ActiveGrant,
    ApprovalDecision,
    AuditEvent,
    DeveloperApplication,
    Organisation,
    OrganisationMembership,
)
from api.models.session import Session
from api.models.test import Test
from api.models.user import User
from api.models_tree import Category, Protocol, ProtocolTest
from api.schemas.user import Role, UserOut
from utils.auth import get_current_user, hash_password
from utils.custom_router import APIRouter
from utils.db import get_db
from utils.logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/admin/access", tags=["Admin Access Management"])


class OrganisationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    is_active: bool = True


class OrganisationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    slug: str | None = Field(
        default=None,
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    is_active: bool | None = None


class UserAdminUpdate(BaseModel):
    email: EmailStr | None = None
    role: Role | None = None
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=12, max_length=256)


class ResourceAssignment(BaseModel):
    test_ids: list[int] = Field(default_factory=list)
    protocol_ids: list[int] = Field(default_factory=list)
    replace_existing: bool = True
    allow_reassign: bool = False


def _require_admin(user: User) -> None:
    if user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")


async def _count(
    db: AsyncSession,
    model: type[Any],
    organisation_id: str,
) -> int:
    value = await db.scalar(
        select(func.count()).select_from(model).where(model.organisation_id == organisation_id)
    )
    return int(value or 0)


def _organisation_payload(
    organisation: Organisation,
    test_count: int = 0,
    protocol_count: int = 0,
    credential_count: int = 0,
) -> dict[str, Any]:
    return {
        "id": organisation.id,
        "name": organisation.name,
        "slug": organisation.slug,
        "is_active": organisation.is_active,
        "created_at": organisation.created_at,
        "test_count": test_count,
        "protocol_count": protocol_count,
        "credential_count": credential_count,
    }


@router.get("/organisations")
async def list_organisations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    rows = (
        await db.execute(select(Organisation).order_by(Organisation.name))
    ).scalars().all()

    result: list[dict[str, Any]] = []
    for organisation in rows:
        result.append(
            _organisation_payload(
                organisation,
                test_count=await _count(db, Test, organisation.id),
                protocol_count=await _count(db, Protocol, organisation.id),
                credential_count=await _count(db, ApiClient, organisation.id),
            )
        )
    return result


@router.post("/organisations", status_code=status.HTTP_201_CREATED)
async def create_organisation(
    payload: OrganisationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    slug = payload.slug.strip().lower()
    existing = await db.scalar(select(Organisation).where(Organisation.slug == slug))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Organisation slug already exists")

    organisation = Organisation(
        name=payload.name.strip(),
        slug=slug,
        is_active=payload.is_active,
    )
    db.add(organisation)
    await db.commit()
    await db.refresh(organisation)
    logger.info(
        "Organisation created",
        extra={"organisation_id": organisation.id, "actor": current_user.email},
    )
    return _organisation_payload(organisation)


@router.patch("/organisations/{organisation_id}")
async def update_organisation(
    organisation_id: str,
    payload: OrganisationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    organisation = await db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")

    if payload.slug is not None:
        slug = payload.slug.strip().lower()
        duplicate = await db.scalar(
            select(Organisation).where(
                Organisation.slug == slug,
                Organisation.id != organisation_id,
            )
        )
        if duplicate:
            raise HTTPException(status.HTTP_409_CONFLICT, "Organisation slug already exists")
        organisation.slug = slug

    if payload.name is not None:
        organisation.name = payload.name.strip()
    if payload.is_active is not None:
        organisation.is_active = payload.is_active

    await db.commit()
    await db.refresh(organisation)
    logger.info(
        "Organisation updated",
        extra={"organisation_id": organisation.id, "actor": current_user.email},
    )
    return _organisation_payload(
        organisation,
        test_count=await _count(db, Test, organisation.id),
        protocol_count=await _count(db, Protocol, organisation.id),
        credential_count=await _count(db, ApiClient, organisation.id),
    )


@router.delete("/organisations/{organisation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organisation(
    organisation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    organisation = await db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")

    dependencies = {
        "tests": await _count(db, Test, organisation_id),
        "categories": await _count(db, Category, organisation_id),
        "protocols": await _count(db, Protocol, organisation_id),
        "protocol tests": await _count(db, ProtocolTest, organisation_id),
        "API credentials": await _count(db, ApiClient, organisation_id),
        "memberships": await _count(db, OrganisationMembership, organisation_id),
        "developer applications": await _count(db, DeveloperApplication, organisation_id),
        "access requests": await _count(db, AccessRequest, organisation_id),
        "approval decisions": await _count(db, ApprovalDecision, organisation_id),
        "active grants": await _count(db, ActiveGrant, organisation_id),
        "audit events": await _count(db, AuditEvent, organisation_id),
    }
    blocking = {name: count for name, count in dependencies.items() if count}
    if blocking:
        details = ", ".join(f"{name}: {count}" for name, count in blocking.items())
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Organisation cannot be deleted while it owns records ({details}). "
            "Deactivate it or remove/reassign those records first.",
        )

    await db.delete(organisation)
    await db.commit()
    logger.info(
        "Organisation deleted",
        extra={"organisation_id": organisation_id, "actor": current_user.email},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/resources")
async def list_resources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    test_rows = (
        await db.execute(
            select(Test, Organisation.name, Organisation.slug)
            .outerjoin(Organisation, Test.organisation_id == Organisation.id)
            .order_by(Test.work_package_name, Test.element_cms_id, Test.test_name, Test.id)
        )
    ).all()

    protocol_rows = (
        await db.execute(
            select(Protocol, Category.name, Organisation.name, Organisation.slug)
            .join(Category, Protocol.category_id == Category.id)
            .outerjoin(Organisation, Protocol.organisation_id == Organisation.id)
            .order_by(Category.name, Protocol.sort_order, Protocol.name, Protocol.id)
        )
    ).all()

    return {
        "tests": [
            {
                "id": test.id,
                "work_package_name": test.work_package_name,
                "element_cms_id": test.element_cms_id,
                "test_name": test.test_name,
                "organisation_id": test.organisation_id,
                "organisation_name": organisation_name,
                "organisation_slug": organisation_slug,
            }
            for test, organisation_name, organisation_slug in test_rows
        ],
        "protocols": [
            {
                "id": protocol.id,
                "name": protocol.name,
                "category_id": protocol.category_id,
                "category_name": category_name,
                "organisation_id": protocol.organisation_id,
                "organisation_name": organisation_name,
                "organisation_slug": organisation_slug,
            }
            for protocol, category_name, organisation_name, organisation_slug in protocol_rows
        ],
    }


@router.put("/organisations/{organisation_id}/resources")
async def assign_resources(
    organisation_id: str,
    payload: ResourceAssignment,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    organisation = await db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    if not organisation.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Organisation is inactive")

    test_ids = set(payload.test_ids)
    protocol_ids = set(payload.protocol_ids)

    selected_tests = (
        (
            await db.execute(select(Test).where(Test.id.in_(test_ids)))
        ).scalars().all()
        if test_ids
        else []
    )
    selected_protocols = (
        (
            await db.execute(select(Protocol).where(Protocol.id.in_(protocol_ids)))
        ).scalars().all()
        if protocol_ids
        else []
    )

    missing_tests = sorted(test_ids - {item.id for item in selected_tests})
    missing_protocols = sorted(protocol_ids - {item.id for item in selected_protocols})
    if missing_tests or missing_protocols:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            {
                "message": "One or more selected resources do not exist",
                "missing_test_ids": missing_tests,
                "missing_protocol_ids": missing_protocols,
            },
        )

    conflicting_tests = sorted(
        item.id
        for item in selected_tests
        if item.organisation_id not in (None, organisation_id)
    )
    conflicting_protocols = sorted(
        item.id
        for item in selected_protocols
        if item.organisation_id not in (None, organisation_id)
    )
    if (conflicting_tests or conflicting_protocols) and not payload.allow_reassign:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "Some resources belong to another organisation",
                "test_ids": conflicting_tests,
                "protocol_ids": conflicting_protocols,
                "guidance": "Enable allow_reassign only after confirming the ownership transfer.",
            },
        )

    removed_test_ids: list[int] = []
    removed_protocol_ids: list[int] = []
    if payload.replace_existing:
        current_test_ids = set(
            (
                await db.execute(
                    select(Test.id).where(Test.organisation_id == organisation_id)
                )
            ).scalars().all()
        )
        current_protocol_ids = set(
            (
                await db.execute(
                    select(Protocol.id).where(Protocol.organisation_id == organisation_id)
                )
            ).scalars().all()
        )
        removed_test_ids = sorted(current_test_ids - test_ids)
        removed_protocol_ids = sorted(current_protocol_ids - protocol_ids)

        if removed_test_ids:
            await db.execute(
                update(Test)
                .where(Test.id.in_(removed_test_ids))
                .values(organisation_id=None)
            )
        if removed_protocol_ids:
            await db.execute(
                update(ProtocolTest)
                .where(ProtocolTest.protocol_id.in_(removed_protocol_ids))
                .values(organisation_id=None)
            )
            await db.execute(
                update(Protocol)
                .where(Protocol.id.in_(removed_protocol_ids))
                .values(organisation_id=None)
            )

    if test_ids:
        await db.execute(
            update(Test).where(Test.id.in_(test_ids)).values(organisation_id=organisation_id)
        )
    if protocol_ids:
        await db.execute(
            update(Protocol)
            .where(Protocol.id.in_(protocol_ids))
            .values(organisation_id=organisation_id)
        )
        await db.execute(
            update(ProtocolTest)
            .where(ProtocolTest.protocol_id.in_(protocol_ids))
            .values(organisation_id=organisation_id)
        )

    await db.commit()
    logger.info(
        "Organisation resources updated",
        extra={
            "organisation_id": organisation_id,
            "test_count": len(test_ids),
            "protocol_count": len(protocol_ids),
            "allow_reassign": payload.allow_reassign,
            "actor": current_user.email,
        },
    )
    return {
        "organisation_id": organisation_id,
        "assigned_test_ids": sorted(test_ids),
        "assigned_protocol_ids": sorted(protocol_ids),
        "removed_test_ids": removed_test_ids,
        "removed_protocol_ids": removed_protocol_ids,
    }


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    payload: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if target.id == current_user.id:
        if payload.is_active is False:
            raise HTTPException(status.HTTP_409_CONFLICT, "You cannot deactivate your own account")
        if payload.role is not None and payload.role != Role.admin:
            raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own admin role")

    if payload.email is not None:
        email = str(payload.email).strip().lower()
        duplicate = await db.scalar(
            select(User).where(
                func.lower(User.email) == email,
                User.id != user_id,
            )
        )
        if duplicate:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email address already exists")
        target.email = email

    if payload.role is not None:
        target.role = payload.role
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.new_password:
        target.password = hash_password(payload.new_password)

    await db.commit()
    await db.refresh(target)
    logger.info(
        "User updated from access console",
        extra={"user_id": user_id, "actor": current_user.email},
    )
    return target


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    if user_id == current_user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot delete your own account")

    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # Preserve API-client records for audit attribution, but stop them immediately.
    await db.execute(
        update(ApiClient).where(ApiClient.user_id == user_id).values(is_active=False)
    )
    await db.execute(delete(Session).where(Session.user_id == user_id))
    await db.delete(target)
    await db.commit()
    logger.info(
        "User deleted and credentials disabled",
        extra={"user_id": user_id, "actor": current_user.email},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
