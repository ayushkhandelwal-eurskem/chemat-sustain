from fastapi import Depends, HTTPException, status, Query, BackgroundTasks
from utils.custom_router import APIRouter
import logging
import math
import time
import json
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional, Callable, Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession

from utils.db import get_db
from utils.auth import get_user_by_role, check_if_private_user
from utils.file import save_uploaded_file, delete_file

from ..services.test import TestService
from ..schemas.test import (
    TestCreate,
    TestCreateForm,
    TestUpdate,
    TestResponse,
    TestListResponse,
    TestListings,
)
from ..schemas.user import Role

# Parser imports
from parsers.mtt import parse_excel_mtt
from parsers.dls import parse_excel_dls
from parsers.ftir import parse_excel_ftir
from parsers.hr_stem import parse_excel_hr_stem
from parsers.uv_vis import parse_excel_uv_vis
from parsers.zeta import parse_excel_zeta
from parsers.sims import parse_excel_sims
from parsers.ros import parse_excel_ros
from parsers.tb import parse_excel_tb
from parsers.ups import parse_excel_ups
from parsers.xps import parse_excel_xps
from parsers.xrd import parse_excel_xrd
from parsers.dsc import parse_excel_dsc
from parsers.tga import parse_excel_tga
from parsers.mnt import parse_excel_mnt

logging.getLogger("multipart.multipart").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["tests"])


# ============================ Parser registry ============================
# Single source of truth. Add a new test type here and both create + update
# pick it up automatically. No more 15-arm if/elif chain duplicated across
# endpoints.
PARSERS: Dict[str, Callable[[str], dict]] = {
    "MTT": parse_excel_mtt,
    "DLS": parse_excel_dls,
    "FTIR": parse_excel_ftir,
    "HR-STEM": parse_excel_hr_stem,
    "UV-VIS": parse_excel_uv_vis,
    "ZETA": parse_excel_zeta,
    "SIMS": parse_excel_sims,
    "ROS": parse_excel_ros,
    "TB": parse_excel_tb,
    "UPS": parse_excel_ups,
    "XPS": parse_excel_xps,
    "XRD": parse_excel_xrd,
    "DSC": parse_excel_dsc,
    "TGA": parse_excel_tga,
    "MNT": parse_excel_mnt,
}

ALLOWED_EXTENSIONS = (".xlsx", ".xls")


# ============================ Helpers ============================
def clean_for_json(obj: Any) -> Any:
    """
    Coerce a parsed-data structure into JSON-safe primitives.

    Replaces the old `json.loads(json.dumps(obj, default=str))` round-trip,
    which was costing real CPU on SIMS payloads (700k+ ion records).
    Walks the structure once and converts the few non-JSON-native types
    we actually have.
    """
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean_for_json(v) for v in obj]
    return str(obj)


def get_parser(test_name: Optional[str]) -> Callable[[str], dict]:
    """Look up a parser by test name, raising 400 if not registered."""
    if not test_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="test_name is required to parse a file",
        )
    parser = PARSERS.get(test_name)
    if not parser:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Parser for test '{test_name}' is not implemented",
        )
    return parser


def validate_excel_filename(filename: Optional[str]) -> None:
    """Validate uploaded filename has a supported Excel extension."""
    if not filename or not filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only Excel files ({', '.join(ALLOWED_EXTENSIONS)}) are allowed",
        )


def save_and_parse(upload_file, test_name: str) -> tuple[str, dict]:
    """
    Persist the uploaded file to disk and run the appropriate parser.

    Returns (saved_path, parsed_data). On any parse/save failure, removes
    the saved file before re-raising as a 400. This keeps the temp-file
    cleanup logic in one place instead of duplicated across endpoints.
    """
    validate_excel_filename(upload_file.filename)
    parser = get_parser(test_name)

    timestamp = int(time.time())
    filename = f"{timestamp}_{upload_file.filename}"
    path = save_uploaded_file(upload_file, "data", filename)

    try:
        parsed = parser(path)
        return path, parsed
    except HTTPException:
        delete_file(path)
        raise
    except Exception as exc:
        logger.exception(f"Error parsing {test_name} file at {path}")
        delete_file(path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing Excel file: {exc}",
        )


def build_payload_from_parse(file_data: dict) -> dict:
    """Map parser output keys to schema field names, with JSON cleaning."""
    return {
        "test_details": clean_for_json(file_data.get("test_details")),
        "raw_data": clean_for_json(file_data.get("replications")),
        "processed_data": clean_for_json(file_data.get("processed_data")),
        "final_results": clean_for_json(file_data.get("final_results")),
        "statistical_analysis": clean_for_json(file_data.get("statistical_analysis")),
    }


async def get_test_service(db: AsyncSession = Depends(get_db)) -> TestService:
    return TestService(db)


# ============================ Endpoints ============================
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_test(
    request: TestCreateForm = Depends(),
    service: TestService = Depends(get_test_service),
    admin: Role = Depends(get_user_by_role(Role.admin)),
):
    """Create a new test with optional Excel file upload."""
    saved_path: Optional[str] = None
    file_payload: dict = {}

    if request.file:
        saved_path, file_data = save_and_parse(request.file, request.test_name)
        file_payload = build_payload_from_parse(file_data)

    test_data = TestCreate(
        work_package_name=request.work_package_name,
        element_cms_id=request.element_cms_id,
        test_name=request.test_name,
        file_path=saved_path,
        is_public=request.is_public,
        release_test_details=request.release_test_details,
        release_raw_data=request.release_raw_data,
        release_processed_data=request.release_processed_data,
        release_final_results=request.release_final_results,
        release_statistical_analysis=request.release_statistical_analysis,
        test_result=request.test_result,
        **file_payload,
    )

    try:
        return await service.create_test(test_data)
    except Exception:
        # If DB write fails after we already saved the file, don't orphan it.
        if saved_path:
            delete_file(saved_path)
        raise


@router.put("/{test_id}")
async def update_test(
    test_id: int,
    request: TestCreateForm = Depends(),
    service: TestService = Depends(get_test_service),
    admin: Role = Depends(get_user_by_role(Role.admin)),
):
    """Update a test with optional Excel file upload."""
    logger.info(f"Updating test with ID: {test_id}")

    # Always fetch the current test so we can clean up its old file later.
    current_test = await service.get_test_by_id(test_id)

    saved_path: Optional[str] = None
    file_payload: dict = {}

    if request.file:
        # Use the explicit test_name from the request, or fall back to the
        # current test's test_name if the caller didn't include it.
        effective_test_name = request.test_name or current_test.test_name
        saved_path, file_data = save_and_parse(request.file, effective_test_name)
        file_payload = build_payload_from_parse(file_data)

    update_data = TestUpdate(
        work_package_name=request.work_package_name,
        element_cms_id=request.element_cms_id,
        test_name=request.test_name,
        is_public=request.is_public,
        release_test_details=request.release_test_details,
        release_raw_data=request.release_raw_data,
        release_processed_data=request.release_processed_data,
        release_final_results=request.release_final_results,
        release_statistical_analysis=request.release_statistical_analysis,
        test_result=request.test_result,
    )

    if file_payload:
        update_data.file_path = saved_path
        update_data.test_details = file_payload["test_details"]
        update_data.raw_data = file_payload["raw_data"]
        update_data.processed_data = file_payload["processed_data"]
        update_data.final_results = file_payload["final_results"]
        update_data.statistical_analysis = file_payload["statistical_analysis"]

    try:
        result = await service.update_test(test_id, update_data)
    except Exception:
        # Roll back the new file on DB failure.
        if saved_path:
            delete_file(saved_path)
        raise

    # Only delete the old file after the DB update succeeds AND a new file
    # was uploaded. Otherwise we'd nuke the existing file on a metadata-only
    # PUT.
    if saved_path and current_test.file_path:
        delete_file(current_test.file_path)

    return result


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test(
    test_id: int,
    service: TestService = Depends(get_test_service),
):
    """Delete a test."""
    test = await service.get_test_by_id(test_id)
    if test.file_path:
        delete_file(test.file_path)
    await service.delete_test(test_id)


@router.get("/{test_id}", response_model=TestResponse)
async def get_test(
    test_id: int,
    service: TestService = Depends(get_test_service),
):
    """Get a test by ID."""
    return await service.get_test_by_id(test_id)


@router.get("/name/{test_name}", response_model=TestResponse)
async def get_test_by_name(
    test_name: str,
    service: TestService = Depends(get_test_service),
):
    """Get a test by name."""
    return await service.get_test_by_name(test_name)


@router.get("/", response_model=TestListResponse)
async def get_tests(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    work_package_name: Optional[str] = Query(None),
    element_cms_id: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    service: TestService = Depends(get_test_service),
    admin: Role = Depends(get_user_by_role(Role.admin)),
):
    """Get tests with filtering and pagination."""
    skip = (page - 1) * per_page
    tests, total = await service.get_tests(
        skip=skip,
        limit=per_page,
        work_package_name=work_package_name,
        element_cms_id=element_cms_id,
        is_public=is_public,
    )
    return TestListResponse(
        tests=tests,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page),
    )


@router.post("/listings")
async def get_listings(
    request: TestListings,
    service: TestService = Depends(get_test_service),
    is_private_user: bool = Depends(check_if_private_user),
):
    return await service.get_listings(request, is_private_user)


@router.post("/json", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
async def create_test_json(
    test_data: TestCreate,
    service: TestService = Depends(get_test_service),
):
    """Create a new test using JSON payload (alternative endpoint)."""
    return await service.create_test(test_data)


@router.put("/json/{test_id}", response_model=TestResponse)
async def update_test_json(
    test_id: int,
    test_data: TestUpdate,
    service: TestService = Depends(get_test_service),
):
    """Update a test using JSON payload (alternative endpoint)."""
    return await service.update_test(test_id, test_data)


@router.get("/work-package/{work_package_name}", response_model=List[TestResponse])
async def get_tests_by_work_package(
    work_package_name: str,
    service: TestService = Depends(get_test_service),
):
    """Get all tests for a specific work package."""
    return await service.get_tests_by_work_package(work_package_name)


@router.get("/public/", response_model=TestListResponse)
async def get_public_tests(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    service: TestService = Depends(get_test_service),
):
    """Get only public tests."""
    skip = (page - 1) * per_page
    tests, total = await service.get_public_tests(skip=skip, limit=per_page)
    return TestListResponse(
        tests=tests,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page),
    )


@router.patch("/bulk-release-flags", response_model=List[TestResponse])
async def bulk_update_release_flags(
    test_ids: List[int],
    release_test_details: Optional[bool] = None,
    release_raw_data: Optional[bool] = None,
    release_processed_data: Optional[bool] = None,
    release_final_results: Optional[bool] = None,
    release_statistical_analysis: Optional[bool] = None,
    service: TestService = Depends(get_test_service),
):
    """Bulk update release flags for multiple tests."""
    flags = {
        "release_test_details": release_test_details,
        "release_raw_data": release_raw_data,
        "release_processed_data": release_processed_data,
        "release_final_results": release_final_results,
        "release_statistical_analysis": release_statistical_analysis,
    }
    release_flags = {k: v for k, v in flags.items() if v is not None}

    if not release_flags:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one release flag must be provided",
        )

    return await service.bulk_update_release_flags(test_ids, release_flags)


@router.patch("/{test_id}/publish", response_model=TestResponse)
async def publish_test(
    test_id: int,
    service: TestService = Depends(get_test_service),
):
    """Publish a test (make it public and release all data)."""
    return await service.update_test(
        test_id,
        TestUpdate(
            is_public=True,
            release_test_details=True,
            release_raw_data=True,
            release_processed_data=True,
            release_final_results=True,
            release_statistical_analysis=True,
        ),
    )


@router.patch("/{test_id}/unpublish", response_model=TestResponse)
async def unpublish_test(
    test_id: int,
    service: TestService = Depends(get_test_service),
):
    """Unpublish a test (make it private and hide all data)."""
    return await service.update_test(
        test_id,
        TestUpdate(
            is_public=False,
            release_test_details=False,
            release_raw_data=False,
            release_processed_data=False,
            release_final_results=False,
            release_statistical_analysis=False,
        ),
    )