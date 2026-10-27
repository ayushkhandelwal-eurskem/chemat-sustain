"""Exercise existing controller lifecycle and schema without a live database."""
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, UploadFile

from api.controllers import test as controller
from api.schemas.test import TestCreateForm, TestListings
from api.services.test import TestService
from test_cell_assay_parsers import make_workbook


@pytest.mark.parametrize("test_type", ["ANNX", "PCR"])
@pytest.mark.asyncio
async def test_create_replace_and_retrieve_assay(tmp_path, monkeypatch, test_type):
    path = make_workbook(tmp_path / "assay.xlsx", test_type)
    deleted = []
    monkeypatch.setattr(controller, "save_uploaded_file", lambda *args, **kwargs: str(path))
    monkeypatch.setattr(controller, "delete_file", deleted.append)
    service = AsyncMock(spec=TestService)
    service.create_test.return_value = SimpleNamespace(id=42)
    request = TestCreateForm(work_package_name="WP3", element_cms_id="CMS_1a_AuNP", test_name=test_type,
        is_public=False, release_test_details=False, release_raw_data=False, release_processed_data=False,
        release_final_results=False, release_statistical_analysis=False, test_result=None,
        file=UploadFile(filename="assay.xlsx", file=BytesIO(path.read_bytes())))
    await controller.create_test(request=request, service=service, admin=None)
    created = service.create_test.await_args.args[0]
    assert created.test_name == test_type
    assert created.raw_data[0]["replication"].startswith("WP3_")
    assert created.processed_data["blocks"]
    assert created.final_results["measurements"]
    assert created.statistical_analysis["available"]

    service.get_test_by_id.return_value = SimpleNamespace(test_name=test_type, file_path="old.xlsx")
    service.update_test.return_value = SimpleNamespace(id=42)
    await controller.update_test(test_id=42, request=request, service=service, admin=None)
    args = service.update_test.await_args
    assert args.args[0] == 42
    assert args.kwargs == {"is_private_user": True}
    assert args.args[1].raw_data == created.raw_data
    assert deleted == ["old.xlsx"]

    # Listings queries retrieve the same JSON columns without a new contract.
    record = SimpleNamespace(**created.model_dump(), id=42)
    db = AsyncMock()
    result = SimpleNamespace(scalar_one_or_none=lambda: record)
    db.execute.return_value = result
    listing = await TestService(db).get_listings(TestListings(work_package_name="WP3", element_cms_id="CMS_1a_AuNP", test_name=test_type), True)
    assert listing.raw_data == created.raw_data
    assert listing.final_results == created.final_results


def test_mismatched_upload_fails_and_cleans_up(tmp_path, monkeypatch):
    path = make_workbook(tmp_path / "pcr.xlsx", "PCR")
    deleted = []
    monkeypatch.setattr(controller, "save_uploaded_file", lambda *args, **kwargs: str(path))
    monkeypatch.setattr(controller, "delete_file", deleted.append)
    with pytest.raises(HTTPException) as error:
        controller.save_and_parse(UploadFile(filename="pcr.xlsx", file=BytesIO(path.read_bytes())), "ANNX")
    assert error.value.status_code == 400
    assert deleted == [str(path)]