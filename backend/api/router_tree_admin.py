"""CRUD endpoints for managing the tree structure.

Optional: you can populate the tree by hand in SQL instead. Use these if you
want UI-driven creation/renaming. Every endpoint in this router mutates shared
navigation data and therefore requires an authenticated legacy administrator.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas.user import Role
from utils.auth import get_user_by_role
from utils.db import get_db
from .models_tree import Category, Protocol, ProtocolTest

router = APIRouter(
    tags=["tree-admin"],
    dependencies=[Depends(get_user_by_role(Role.admin))],
)


# --------------------------- request schemas --------------------------------
class CategoryIn(BaseModel):
    name: str
    sort_order: int = 0


class ProtocolIn(BaseModel):
    category_id: int
    name: str
    description: str | None = None
    sort_order: int = 0


class ProtocolPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    category_id: int | None = None
    sort_order: int | None = None


class TestLinkIn(BaseModel):
    protocol_id: int
    work_package_name: str
    element_cms_id: str
    test_name: str
    sort_order: int = 0


# ------------------------------ categories ----------------------------------
@router.post("/categories")
async def create_category(body: CategoryIn, session: AsyncSession = Depends(get_db)):
    cat = Category(name=body.name, sort_order=body.sort_order)
    session.add(cat)
    await session.commit()
    return {"id": cat.id, "name": cat.name, "sort_order": cat.sort_order}


@router.patch("/categories/{category_id}")
async def rename_category(
    category_id: int, body: CategoryIn, session: AsyncSession = Depends(get_db)
):
    cat = (
        await session.execute(select(Category).where(Category.id == category_id))
    ).scalar_one_or_none()
    if cat is None:
        raise HTTPException(404, "Category not found")
    cat.name = body.name
    cat.sort_order = body.sort_order
    await session.commit()
    return {"id": cat.id, "name": cat.name, "sort_order": cat.sort_order}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: int, session: AsyncSession = Depends(get_db)):
    cat = (
        await session.execute(select(Category).where(Category.id == category_id))
    ).scalar_one_or_none()
    if cat is None:
        raise HTTPException(404, "Category not found")
    await session.delete(cat)  # cascades to protocols and links
    await session.commit()
    return {"id": category_id, "deleted": True}


# ------------------------------- protocols ----------------------------------
@router.post("/protocols")
async def create_protocol(body: ProtocolIn, session: AsyncSession = Depends(get_db)):
    proto = Protocol(
        category_id=body.category_id,
        name=body.name,
        description=body.description,
        sort_order=body.sort_order,
    )
    session.add(proto)
    await session.commit()
    return {"id": proto.id, "name": proto.name}


@router.patch("/protocols/{protocol_id}")
async def update_protocol(
    protocol_id: int, body: ProtocolPatch, session: AsyncSession = Depends(get_db)
):
    proto = (
        await session.execute(select(Protocol).where(Protocol.id == protocol_id))
    ).scalar_one_or_none()
    if proto is None:
        raise HTTPException(404, "Protocol not found")
    if body.name is not None:
        proto.name = body.name
    if body.description is not None:
        proto.description = body.description
    if body.category_id is not None:
        proto.category_id = body.category_id
    if body.sort_order is not None:
        proto.sort_order = body.sort_order
    await session.commit()
    return {"id": proto.id, "name": proto.name}


@router.delete("/protocols/{protocol_id}")
async def delete_protocol(protocol_id: int, session: AsyncSession = Depends(get_db)):
    proto = (
        await session.execute(select(Protocol).where(Protocol.id == protocol_id))
    ).scalar_one_or_none()
    if proto is None:
        raise HTTPException(404, "Protocol not found")
    await session.delete(proto)  # cascades to test links
    await session.commit()
    return {"id": protocol_id, "deleted": True}


# ------------------------------- test links ---------------------------------
@router.post("/protocol-tests")
async def attach_test(body: TestLinkIn, session: AsyncSession = Depends(get_db)):
    link = ProtocolTest(
        protocol_id=body.protocol_id,
        work_package_name=body.work_package_name,
        element_cms_id=body.element_cms_id,
        test_name=body.test_name,
        sort_order=body.sort_order,
    )
    session.add(link)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            409, "This test is already attached to a protocol. Move it instead."
        )
    return {"id": link.id}


@router.patch("/protocol-tests/{link_id}/move")
async def move_test(
    link_id: int, protocol_id: int, session: AsyncSession = Depends(get_db)
):
    link = (
        await session.execute(select(ProtocolTest).where(ProtocolTest.id == link_id))
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(404, "Test link not found")
    link.protocol_id = protocol_id
    await session.commit()
    return {"id": link.id, "protocol_id": protocol_id}


@router.patch("/protocol-tests/{link_id}/rename")
async def rename_test(
    link_id: int, display_name: str, session: AsyncSession = Depends(get_db)
):
    """Set the editable display label for a test. Pass an empty string to clear
    it (the tree then falls back to the real test_name)."""
    link = (
        await session.execute(select(ProtocolTest).where(ProtocolTest.id == link_id))
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(404, "Test link not found")
    link.display_name = display_name.strip() or None
    await session.commit()
    return {"id": link.id, "display_name": link.display_name}


@router.delete("/protocol-tests/{link_id}")
async def detach_test(link_id: int, session: AsyncSession = Depends(get_db)):
    link = (
        await session.execute(select(ProtocolTest).where(ProtocolTest.id == link_id))
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(404, "Test link not found")
    await session.delete(link)
    await session.commit()
    return {"id": link_id, "deleted": True}