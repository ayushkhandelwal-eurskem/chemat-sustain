from fastapi import Depends, HTTPException, status, Query, UploadFile, File, Form
from utils.custom_router import APIRouter
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from utils.db import get_db  # Make sure you have this function
from ..services.test import TestService
from ..schemas.test import (
    TestCreate,
    TestCreateForm, 
    TestUpdate, 
    TestResponse, 
    TestListResponse,
    TestListings
)
from parsers.mtt import parse_excel_mtt
import tempfile
import math
import shutil
from utils.auth import get_user_by_role, check_if_private_user
from ..schemas.user import Role
import json
import logging
from utils.file import save_uploaded_file, delete_file
import time
logging.getLogger("multipart.multipart").setLevel(logging.WARNING)
router = APIRouter(tags=["tests"])

def clean_for_json(obj):
    return json.loads(json.dumps(obj, default=str))

async def get_test_service(db: AsyncSession = Depends(get_db)) -> TestService:
    return TestService(db)


@router.post("/", 
            # response_model=TestResponse, 
            status_code=status.HTTP_201_CREATED)
async def create_test(
    request:TestCreateForm = Depends(),
    service: TestService = Depends(get_test_service),
    admin: Role = Depends(get_user_by_role(Role.admin))
):
    """Create a new test with optional Excel file upload"""
    
    # Process file if provided
    file_data = {}
    if request.file:
        if not request.file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only Excel files (.xlsx, .xls) are allowed"
            )
        
        try:
            timestamp = int(time.time())
            filename = f"{timestamp}_{request.file.filename}"
            path = save_uploaded_file(request.file, "data", filename)
                
            if request.test_name == "MTT":
                file_data = parse_excel_mtt(path)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This test not implemented yet"
                )
        except Exception as e:
            delete_file(path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error processing Excel file: {str(e)}"
            )
    
    # Create test data
    test_data = TestCreate(
        work_package_name=request.work_package_name,
        element_cms_id=request.element_cms_id,
        test_name=request.test_name,
        file_path=path,
        is_public=request.is_public,
        release_test_details=request.release_test_details,
        release_raw_data=request.release_raw_data,
        release_processed_data=request.release_processed_data,
        release_final_results=request.release_final_results,
        release_statistical_analysis=request.release_statistical_analysis,
        test_result=request.test_result,
        test_details=clean_for_json(file_data.get("test_details")),
        raw_data=clean_for_json(file_data.get("replications")),
        processed_data=clean_for_json(file_data.get("processed_data")),
        final_results=clean_for_json(file_data.get("final_results"))
    )
    
    return await service.create_test(test_data)


@router.get("/{test_id}", response_model=TestResponse)
async def get_test(
    test_id: int,
    service: TestService = Depends(get_test_service)
):
    """Get a test by ID"""
    return await service.get_test_by_id(test_id)


@router.get("/name/{test_name}", response_model=TestResponse)
async def get_test_by_name(
    test_name: str,
    service: TestService = Depends(get_test_service)
):
    """Get a test by name"""
    return await service.get_test_by_name(test_name)


@router.get("/", response_model=TestListResponse)
async def get_tests(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(10, ge=1, le=100, description="Items per page"),
    work_package_name: Optional[str] = Query(None, description="Filter by work package name"),
    element_cms_id: Optional[str] = Query(None, description="Filter by element CMS ID"),
    is_public: Optional[bool] = Query(None, description="Filter by public status"),
    service: TestService = Depends(get_test_service),
    admin: Role = Depends(get_user_by_role(Role.admin))
):
    """Get tests with filtering and pagination"""
    skip = (page - 1) * per_page
    tests, total = await service.get_tests(
        skip=skip,
        limit=per_page,
        work_package_name=work_package_name,
        element_cms_id=element_cms_id,
        is_public=is_public
    )
    
    total_pages = math.ceil(total / per_page)
    
    return TestListResponse(
        tests=tests,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages
    )



@router.post("/listings")
async def get_listings(
    request:TestListings,
    service: TestService = Depends(get_test_service),
    is_private_user: bool = Depends(check_if_private_user)
):
    return await service.get_listings(request, is_private_user)

@router.put("/{test_id}")
async def update_test(
    test_id:int,
    request: TestCreateForm = Depends(),
    service: TestService = Depends(get_test_service),
    admin: Role = Depends(get_user_by_role(Role.admin))
):
    """Update a test with optional Excel file upload"""
    
    # Process file if provided
    file_data = {}
    if request.file:
        if not request.file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only Excel files (.xlsx, .xls) are allowed"
            )
        
        try:
            current_test = await service.get_test_by_id(test_id)
            if request.file:
                timestamp = int(time.time())
                filename = f"{timestamp}_{request.file.filename}"
                path = save_uploaded_file(request.file, "data", filename)
                
            if request.test_name == "MTT":
                file_data = parse_excel_mtt(path)
            else:
                # Get current test to check its test_name if not provided in update
                if not request.test_name:
                    if current_test.test_name == "MTT":
                        file_data = parse_excel_mtt(path)
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="This test not implemented yet"
                        )
        except Exception as e:
            delete_file(path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error processing Excel file: {str(e)}"
            )
    
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
        test_result=request.test_result
    )
    
    # Add file data if provided
    if file_data:
        update_data.file_path = path
        update_data.test_details=clean_for_json(file_data.get("test_details"))
        update_data.raw_data=clean_for_json(file_data.get("replications"))
        update_data.processed_data=clean_for_json(file_data.get("processed_data"))
        update_data.final_results=clean_for_json(file_data.get("final_results"))
        
        delete_file(current_test.file_path)
    
    return await service.update_test(test_id, update_data)


@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test(
    test_id: int,
    service: TestService = Depends(get_test_service)
):
    """Delete a test"""
    test = await service.get_test_by_id(test_id)
    delete_file(test.file_path)
    await service.delete_test(test_id)


@router.post("/json", response_model=TestResponse, status_code=status.HTTP_201_CREATED)
async def create_test_json(
    test_data: TestCreate,
    service: TestService = Depends(get_test_service)
):
    """Create a new test using JSON payload (alternative endpoint)"""
    return await service.create_test(test_data)


@router.put("/json/{test_id}", response_model=TestResponse)
async def update_test_json(
    test_id: int,
    test_data: TestUpdate,
    service: TestService = Depends(get_test_service)
):
    """Update a test using JSON payload (alternative endpoint)"""
    return await service.update_test(test_id, test_data)


@router.get("/work-package/{work_package_name}", response_model=List[TestResponse])
async def get_tests_by_work_package(
    work_package_name: str,
    service: TestService = Depends(get_test_service)
):
    """Get all tests for a specific work package"""
    return await service.get_tests_by_work_package(work_package_name)


@router.get("/public/", response_model=TestListResponse)
async def get_public_tests(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(10, ge=1, le=100, description="Items per page"),
    service: TestService = Depends(get_test_service)
):
    """Get only public tests"""
    skip = (page - 1) * per_page
    tests, total = await service.get_public_tests(skip=skip, limit=per_page)
    
    total_pages = math.ceil(total / per_page)
    
    return TestListResponse(
        tests=tests,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages
    )


@router.patch("/bulk-release-flags", response_model=List[TestResponse])
async def bulk_update_release_flags(
    test_ids: List[int],
    release_test_details: Optional[bool] = None,
    release_raw_data: Optional[bool] = None,
    release_processed_data: Optional[bool] = None,
    release_final_results: Optional[bool] = None,
    service: TestService = Depends(get_test_service)
):
    """Bulk update release flags for multiple tests"""
    release_flags = {}
    
    if release_test_details is not None:
        release_flags["release_test_details"] = release_test_details
    if release_raw_data is not None:
        release_flags["release_raw_data"] = release_raw_data
    if release_processed_data is not None:
        release_flags["release_processed_data"] = release_processed_data
    if release_final_results is not None:
        release_flags["release_final_results"] = release_final_results
    
    if not release_flags:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one release flag must be provided"
        )
    
    return await service.bulk_update_release_flags(test_ids, release_flags)


@router.patch("/{test_id}/publish", response_model=TestResponse)
async def publish_test(
    test_id: int,
    service: TestService = Depends(get_test_service)
):
    """Publish a test (make it public and release all data)"""
    test_data = TestUpdate(
        is_public=True,
        release_test_details=True,
        release_raw_data=True,
        release_processed_data=True,
        release_final_results=True
    )
    return await service.update_test(test_id, test_data)


@router.patch("/{test_id}/unpublish", response_model=TestResponse)
async def unpublish_test(
    test_id: int,
    service: TestService = Depends(get_test_service)
):
    """Unpublish a test (make it private and hide all data)"""
    test_data = TestUpdate(
        is_public=False,
        release_test_details=False,
        release_raw_data=False,
        release_processed_data=False,
        release_final_results=False
    )
    return await service.update_test(test_id, test_data)



