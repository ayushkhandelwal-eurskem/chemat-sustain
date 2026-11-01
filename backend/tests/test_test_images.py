from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import Workbook
from openpyxl.drawing.image import Image
from PIL import Image as PILImage

from api.controllers import test_images as controller
from api.schemas.user import Role
from utils import test_images as store


def picture():
    stream=BytesIO()
    PILImage.new("RGB",(5,5),"white").save(stream,format="PNG")
    return stream.getvalue()


@pytest.fixture
def image_api(tmp_path,monkeypatch):
    monkeypatch.setenv("TENANT_DATA_ROOT",str(tmp_path))
    test=SimpleNamespace(id=7,work_package_name="WP3",element_cms_id="CMS_1c_AuNP",test_name="ANNX",file_path=None,
                         is_public=False,release_raw_data=False,release_processed_data=False,release_final_results=False,
                         release_statistical_analysis=False,release_test_details=False)
    user=SimpleNamespace(role=Role.admin)
    db=AsyncMock()
    db.execute.return_value=SimpleNamespace(scalar_one_or_none=lambda:test)
    app=FastAPI()
    app.include_router(controller.router)
    app.dependency_overrides[controller.get_db]=lambda:db
    app.dependency_overrides[controller.get_current_user]=lambda:user
    # Override the factory-produced admin dependency with equivalent role checks.
    for route in controller.router.routes:
        for dependency in route.dependant.dependencies:
            if dependency.name=="admin":
                async def admin_check():
                    from fastapi import HTTPException
                    if user.role!=Role.admin: raise HTTPException(403,"Admin required")
                    return user
                app.dependency_overrides[dependency.call]=admin_check
    return TestClient(app),test,user,tmp_path


def test_image_upload_relabel_release_and_delete(image_api):
    client,test,user,_=image_api
    response=client.post("/test-images/7",data={"category":"final","title":"Dot plot"},files={"file":("plot.png",picture(),"image/png")})
    assert response.status_code==200,response.text
    image=response.json()
    assert client.get(image["url"]).status_code==200
    user.role=Role.public_viewer
    assert client.get(image["url"]).status_code==404
    test.is_public=True
    assert client.get(image["url"]).status_code==404
    test.release_final_results=True
    assert client.get(image["url"]).status_code==200
    assert client.post("/test-images/7",data={"category":"final"},files={"file":("p.png",picture(),"image/png")}).status_code==403
    user.role=Role.admin
    assert client.patch(f"/test-images/7/{image['id']}",json={"title":"Raw plot","category":"raw"}).status_code==200
    user.role=Role.public_viewer
    assert client.get(image["url"]).status_code==404
    user.role=Role.admin
    assert client.delete(f"/test-images/7/{image['id']}").status_code==200
    assert client.get(image["url"]).status_code==404


def test_image_list_hides_private_and_unreleased_categories(image_api):
    client,test,user,_=image_api
    store.add_image(7,picture(),"Final","final")
    store.add_image(7,picture(),"Raw","raw")
    params={"work_package":"WP3","element":"CMS_1c_AuNP","test_name":"ANNX"}
    assert len(client.get("/test-images",params=params).json()["images"])==2
    user.role=Role.public_viewer
    assert client.get("/test-images",params=params).status_code==404
    test.is_public=True;test.release_final_results=True
    response=client.get("/test-images",params=params)
    assert [i["title"] for i in response.json()["images"]]==["Final"]


def test_invalid_content_category_and_path_are_rejected(image_api):
    client,_,_,_=image_api
    assert client.post("/test-images/7",data={"category":"final"},files={"file":("evil.svg",b"<svg/>","image/svg+xml")}).status_code==400
    assert client.post("/test-images/7",data={"category":"invalid"},files={"file":("a.png",picture(),"image/png")}).status_code==400
    assert client.get("/test-images/7/not-a-valid-id/file").status_code==404


def test_workbook_auto_import_and_manual_overrides(image_api):
    _,test,_,root=image_api
    workbook=Workbook();sheet=workbook.active;sheet.title="Final results"
    sheet["K3"]="Negative control";sheet["C9"]="WP3_ANX_1cR1"
    sheet.add_image(Image(BytesIO(picture())),"K5")
    unknown=workbook.create_sheet("Miscellaneous")
    unknown.add_image(Image(BytesIO(picture())),"A2")
    path=root/"assay.xlsx";workbook.save(path);workbook.close()
    test.file_path=str(path)
    store.extract_workbook_images(7,str(path))
    manifest=store.list_images(7)
    assert len(manifest["images"])==2
    image=next(i for i in manifest["images"] if i["category"]=="final")
    assert image["title"]=="Negative control"
    assert image["replication"]=="WP3_ANX_1cR1"
    assert next(i for i in manifest["images"] if i["sheet"]=="Miscellaneous")["category"] is None
    store.change_image(7,image["id"],title="Corrected",category="processed")
    store.extract_workbook_images(7,str(path))
    assert next(i for i in store.list_images(7)["images"] if i["id"]==image["id"])["title"]=="Corrected"
    store.change_image(7,image["id"],delete=True)
    store.extract_workbook_images(7,str(path))
    assert next(i for i in store.list_images(7)["images"] if i["id"]==image["id"])["hidden"] is True


def test_external_workbook_path_is_not_read(image_api):
    store.extract_workbook_images(7,"/etc/passwd")
    assert store.list_images(7)["images"]==[]