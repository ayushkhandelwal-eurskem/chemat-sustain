from pydantic import BaseModel, Field
from fastapi import Form, File, UploadFile
from typing import Optional, Dict, Any, List, Union
from datetime import datetime


class TestBase(BaseModel):
    work_package_name: str = Field(..., description="Work package name")
    element_cms_id: str = Field(..., description="Element CMS ID")
    test_name: str = Field(..., description="Unique test name")
    # Optional to match the model, where file_path is nullable=True. It was
    # declared required here, so any record without a stored file - or any
    # response that deliberately withholds the path from a public caller -
    # failed serialization with a 500.
    file_path: Optional[str] = Field(None, description="Server-side file reference; withheld from public callers")
    test_details: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(None, description="Test details in JSON format")
    raw_data: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(None, description="Raw data in JSON format")
    processed_data: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(None, description="Processed data in JSON format")
    final_results: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(None, description="Final results in JSON format")
    statistical_analysis: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(None, description="Statistical analysis in JSON format")
    is_public: bool = Field(False, description="Whether the test is public")
    release_test_details: Optional[bool] = Field(None, description="Whether to release test details")
    release_raw_data: Optional[bool] = Field(None, description="Whether to release raw data")
    release_processed_data: Optional[bool] = Field(None, description="Whether to release processed data")
    release_final_results: Optional[bool] = Field(None, description="Whether to release final results")
    release_statistical_analysis: bool = Field(False, description="Whether to release statistical analysis")
    test_result: Optional[bool] = Field(None, description="Whether the test passed or failed")

class TestCreateForm:
    def __init__(
        self,
        work_package_name: str = Form(...),
        element_cms_id: str = Form(...),
        test_name: str = Form(...),
        is_public: bool = Form(False),
        release_test_details: bool = Form(False),
        release_raw_data: bool = Form(False),
        release_processed_data: bool = Form(False),
        release_final_results: bool = Form(False),
        release_statistical_analysis: bool = Form(False),
        file: Optional[UploadFile] = File(None),
        test_result: Optional[str] = Form(None)
    ):
        self.work_package_name = work_package_name
        self.element_cms_id = element_cms_id
        self.test_name = test_name
        self.is_public = is_public
        self.release_test_details = release_test_details
        self.release_raw_data = release_raw_data
        self.release_processed_data = release_processed_data
        self.release_final_results = release_final_results
        self.release_statistical_analysis = release_statistical_analysis
        self.file = file
        if test_result is None or test_result.lower() in ("null", ""):
            self.test_result = None
        else:
            self.test_result = test_result.lower() == "true"



class TestCreate(TestBase):
    pass


class TestUpdate(BaseModel):
    work_package_name: Optional[str] = None
    element_cms_id: Optional[str] = None
    test_name: Optional[str] = None
    file_path: Optional[str] = None
    test_details: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None
    raw_data: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None
    processed_data: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None
    final_results: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None
    statistical_analysis: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None
    is_public: Optional[bool] = None
    release_test_details: Optional[bool] = None
    release_raw_data: Optional[bool] = None
    release_processed_data: Optional[bool] = None
    release_final_results: Optional[bool] = None
    release_statistical_analysis: Optional[bool] = None
    test_result : Optional[bool] = None


class TestResponse(TestBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TestListResponse(BaseModel):
    tests: list[TestResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class TestListings(BaseModel):
    work_package_name: Optional[str] = None
    element_cms_id: Optional[str] = None
    test_name: Optional[str] = None


class ListingsResponse(BaseModel):
    work_packages: Optional[List[str]] = []
    element_cms_ids: Optional[List[str]] = []
    test_names: Optional[List[str]] = []