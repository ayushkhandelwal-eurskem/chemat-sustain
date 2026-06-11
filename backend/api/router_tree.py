"""Read-only navigation tree endpoint.

GET /tree returns the full nested structure for the sidebar:
    [ Category -> [ Protocol -> [ Test ] ] ]

Uses a single selectinload chain, so the whole tree is fetched in 3 queries
total regardless of size (no N+1).
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from utils.db import get_db
from .models_tree import Category, Protocol

router = APIRouter(prefix="/tree", tags=["tree"])


@router.get("")
async def get_tree(session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(Category)
        .options(selectinload(Category.protocols).selectinload(Protocol.tests))
        .order_by(Category.sort_order)
    )
    categories = result.scalars().all()

    return [
        {
            "id": c.id,
            "name": c.name,
            "protocols": [
                {
                    "id": p.id,
                    "name": p.name,
                    "description": p.description,
                    "has_file": p.file_path is not None,
                    "file_name": p.file_name,
                    "file_mime": p.file_mime,
                    "tests": [
                        {
                            "id": t.id,
                            "work_package_name": t.work_package_name,
                            "element_cms_id": t.element_cms_id,
                            "test_name": t.test_name,
                            "display_name": t.display_name,
                        }
                        for t in p.tests
                    ],
                }
                for p in c.protocols
            ],
        }
        for c in categories
    ]