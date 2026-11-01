"""Image access uses the same test and section release rules as scientific JSON."""
from functools import partial
from pathlib import Path
import re
import logging

from fastapi import Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from utils.custom_router import APIRouter
from utils.auth import get_current_user, get_user_by_role
from utils.db import get_db
from utils import test_images as store
from utils.workbook_charts import extract_workbook_charts
from api.models.test import Test
from api.schemas.user import Role

router = APIRouter(prefix="/test-images", tags=["Test Images"])
logger = logging.getLogger(__name__)
RELEASE = {"raw": "release_raw_data", "processed": "release_processed_data", "final": "release_final_results",
           "statistics": "release_statistical_analysis", "conditions": "release_test_details"}


async def get_test(test_id, db):
    result = await db.execute(select(Test).where(Test.id == test_id))
    test = result.scalar_one_or_none()
    if test is None:
        raise HTTPException(404, "Test not found")
    return test


def can_read(test, user, category):
    if user.role in (Role.admin, Role.user):
        return True
    return bool(category in RELEASE and test.is_public and getattr(test, RELEASE[category], False))


def public_image(test_id, image):
    return {**{k: v for k, v in image.items() if k != "hidden"}, "url": f"/test-images/{test_id}/{image['id']}/file"}


@router.get("")
async def images_for_test(work_package: str, element: str, test_name: str,
                          db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Test).where(Test.work_package_name == work_package,
                                               Test.element_cms_id == element, Test.test_name == test_name))
    test = result.scalar_one_or_none()
    if test is None or (user.role not in (Role.admin, Role.user) and not test.is_public):
        raise HTTPException(404, "Test not found")
    # Parse only if this caller has at least one released image category.
    if not any(can_read(test, user, category) for category in RELEASE):
        return {"test_id": test.id, "images": [], "charts": [], "warnings": []}
    try:
        await run_in_threadpool(store.extract_workbook_images, test.id, test.file_path)
    except Exception:
        # Manual images remain usable if an old workbook is corrupt or absent.
        logger.warning("Workbook image extraction failed for test %s", test.id, exc_info=True)
    if can_read(test, user, "final"):
        try:
            await run_in_threadpool(extract_workbook_charts, test.id, test.file_path)
        except Exception:
            logger.warning("Workbook chart extraction failed for test %s", test.id, exc_info=True)
    manifest = await run_in_threadpool(store.list_images, test.id)
    admin = user.role == Role.admin
    return {"test_id": test.id, "images": [public_image(test.id, image) for image in manifest["images"]
            if not image.get("hidden") and (admin or can_read(test, user, image["category"]))],
            "charts": manifest.get("charts", []) if can_read(test, user, "final") else [],
            "warnings": manifest.get("warnings", []) + manifest.get("chart_warnings", []) if admin else []}


@router.get("/{test_id}/{image_id}/file")
async def image_file(test_id: int, image_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    if not re.fullmatch(r"(?:excel-)?[a-f0-9]{32}", image_id):
        raise HTTPException(404, "Image not found")
    test = await get_test(test_id, db)
    manifest = await run_in_threadpool(store.list_images, test.id)
    image = next((i for i in manifest["images"] if i["id"] == image_id and not i.get("hidden")), None)
    if image is None or not (user.role == Role.admin or can_read(test, user, image["category"])):
        raise HTTPException(404, "Image not found")
    path = store.image_root() / str(test.id) / f"{image_id}.png"
    if not path.is_file():
        raise HTTPException(404, "Image not found")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.post("/{test_id}")
async def upload_image(test_id: int, category: str = Form(...), title: str = Form("", max_length=200),
                       file: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                       admin=Depends(get_user_by_role(Role.admin))):
    await get_test(test_id, db)
    try:
        content = await file.read(store.MAX_BYTES + 1)
        if len(content) > store.MAX_BYTES:
            raise HTTPException(413, "Image exceeds 15 MB")
        image = await run_in_threadpool(store.add_image, test_id, content, title or Path(file.filename or "Image").stem, category)
        return public_image(test_id, image)
    except (ValueError, OSError) as error:
        raise HTTPException(400, "Invalid image or category; use PNG, JPEG, WebP, GIF, BMP or TIFF, up to 15 MB and 25 megapixels.") from error
    finally:
        await file.close()


class ImageUpdate(BaseModel):
    title: str = Field(max_length=200)
    category: str


@router.patch("/{test_id}/{image_id}")
async def update_image(test_id: int, image_id: str, body: ImageUpdate, db: AsyncSession = Depends(get_db),
                       admin=Depends(get_user_by_role(Role.admin))):
    await get_test(test_id, db)
    try:
        image = await run_in_threadpool(partial(store.change_image, test_id, image_id, title=body.title, category=body.category))
        return public_image(test_id, image)
    except KeyError:
        raise HTTPException(404, "Image not found")
    except ValueError:
        raise HTTPException(400, "Invalid category")


@router.delete("/{test_id}/{image_id}")
async def delete_image(test_id: int, image_id: str, db: AsyncSession = Depends(get_db),
                       admin=Depends(get_user_by_role(Role.admin))):
    await get_test(test_id, db)
    try:
        await run_in_threadpool(partial(store.change_image, test_id, image_id, delete=True))
    except KeyError:
        raise HTTPException(404, "Image not found")
    return {"deleted": True}