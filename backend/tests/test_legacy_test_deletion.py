from inspect import signature
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.params import Depends

from api.controllers.test import delete_test
from api.schemas.user import Role
from api.services.test import TestService


@pytest.mark.asyncio
async def test_delete_controller_uses_private_visibility_for_admin_test():
    record = SimpleNamespace(file_path=None)
    service = AsyncMock(spec=TestService)
    service.delete_test.return_value = record

    await delete_test(test_id=42, service=service, admin=Role.admin)

    service.delete_test.assert_awaited_once_with(42, is_private_user=True)


@pytest.mark.asyncio
async def test_delete_controller_removes_file_after_database_delete():
    record = SimpleNamespace(file_path="/app/data/test.xlsx")
    service = AsyncMock(spec=TestService)
    events: list[str] = []

    async def delete_record(*args, **kwargs):
        events.append("database")
        return record

    service.delete_test.side_effect = delete_record

    with patch("api.controllers.test.delete_file", side_effect=lambda path: events.append("file")) as remove:
        await delete_test(test_id=42, service=service, admin=Role.admin)

    assert events == ["database", "file"]
    remove.assert_called_once_with("/app/data/test.xlsx")


def test_delete_endpoint_requires_admin_role_dependency():
    admin_parameter = signature(delete_test).parameters["admin"]

    assert isinstance(admin_parameter.default, Depends)


@pytest.mark.asyncio
async def test_service_delete_uses_private_visibility_when_requested():
    record = SimpleNamespace()
    db = AsyncMock()
    service = TestService(db)
    service.get_test_by_id = AsyncMock(return_value=record)

    assert await service.delete_test(42, is_private_user=True) is record

    service.get_test_by_id.assert_awaited_once_with(42, is_private_user=True)
    db.delete.assert_awaited_once_with(record)
    db.commit.assert_awaited_once_with()