from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from api.controllers.test import publish_test, unpublish_test, update_test_json
from api.schemas.test import TestReleaseSelection, TestUpdate
from api.schemas.user import Role
from api.services.test import RELEASE_FIELDS, TestService, enforce_private_release_flags


@pytest.mark.asyncio
async def test_service_update_can_retrieve_private_test_explicitly():
    record = SimpleNamespace(
        test_name="MTT",
        work_package_name="WP3",
        element_cms_id="CMS_1a_AuNP",
        is_public=False,
    )
    db = AsyncMock()
    service = TestService(db)
    service.get_test_by_id = AsyncMock(return_value=record)

    result = await service.update_test(
        42, TestUpdate(is_public=True), is_private_user=True
    )

    assert result is record
    assert record.is_public is True
    service.get_test_by_id.assert_awaited_once_with(
        42, is_private_user=True
    )
    db.commit.assert_awaited_once_with()
    db.refresh.assert_awaited_once_with(record)


@pytest.mark.asyncio
async def test_making_test_private_revokes_all_release_flags():
    record = SimpleNamespace(
        test_name="MTT",
        work_package_name="WP3",
        element_cms_id="CMS_1a_AuNP",
        is_public=True,
        **{field: True for field in RELEASE_FIELDS},
    )
    db = AsyncMock()
    service = TestService(db)
    service.get_test_by_id = AsyncMock(return_value=record)

    await service.update_test(
        42, TestUpdate(is_public=False), is_private_user=True
    )

    assert record.is_public is False
    assert not any(getattr(record, field) for field in RELEASE_FIELDS)


def test_private_test_cannot_request_released_sections():
    with pytest.raises(HTTPException) as error:
        enforce_private_release_flags(
            {"is_public": False, "release_raw_data": True}
        )

    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_publish_private_test_releases_only_selected_sections():
    service = AsyncMock(spec=TestService)
    service.update_test.return_value = SimpleNamespace(id=42)

    selection = TestReleaseSelection(
        release_test_details=True,
        release_final_results=True,
    )
    await publish_test(
        test_id=42, selection=selection, service=service, admin=Role.admin
    )

    args, kwargs = service.update_test.await_args
    assert args[0] == 42
    payload = args[1]
    assert payload.is_public is True
    assert payload.release_test_details is True
    assert payload.release_raw_data is False
    assert payload.release_processed_data is False
    assert payload.release_final_results is True
    assert payload.release_statistical_analysis is False
    assert kwargs == {"is_private_user": True}


@pytest.mark.asyncio
async def test_unpublish_private_test_hides_every_section():
    service = AsyncMock(spec=TestService)
    service.update_test.return_value = SimpleNamespace(id=42)

    await unpublish_test(test_id=42, service=service, admin=Role.admin)

    args, kwargs = service.update_test.await_args
    payload = args[1]
    assert payload.is_public is False
    assert payload.release_test_details is False
    assert payload.release_raw_data is False
    assert payload.release_processed_data is False
    assert payload.release_final_results is False
    assert payload.release_statistical_analysis is False
    assert kwargs == {"is_private_user": True}


@pytest.mark.asyncio
async def test_json_admin_update_uses_private_visibility():
    service = AsyncMock(spec=TestService)
    payload = TestUpdate(is_public=True, release_final_results=True)

    await update_test_json(
        test_id=42, test_data=payload, service=service, admin=Role.admin
    )

    service.update_test.assert_awaited_once_with(
        42, payload, is_private_user=True
    )


@pytest.mark.asyncio
async def test_bulk_release_cannot_enable_section_on_private_test():
    record = SimpleNamespace(id=42, is_public=False)
    result = MagicMock()
    result.scalars.return_value.all.return_value = [record]
    db = AsyncMock()
    db.execute.return_value = result
    service = TestService(db)

    with pytest.raises(HTTPException) as error:
        await service.bulk_update_release_flags(
            [42], {"release_raw_data": True}
        )

    assert error.value.status_code == 409
    db.commit.assert_not_awaited()