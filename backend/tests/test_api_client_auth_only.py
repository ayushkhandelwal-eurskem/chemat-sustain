from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPBasicCredentials

from security.auth import Principal, get_principal


@pytest.mark.asyncio
async def test_local_api_client_credentials_resolve_principal():
    principal = Principal(
        subject="api-client:cms_test",
        email=None,
        organisation_id="org-1",
        roles=frozenset({"service_account"}),
        scopes=frozenset({"tests:read"}),
        client_id="cms_test",
        token_id=None,
    )
    with patch(
        "security.api_key.authenticate_api_client",
        new=AsyncMock(return_value=principal),
    ) as authenticate:
        result = await get_principal(
            basic=HTTPBasicCredentials(username="cms_test", password="not-a-real-secret"),
            db=AsyncMock(),
        )
    assert result == principal
    authenticate.assert_awaited_once()


@pytest.mark.asyncio
async def test_missing_api_client_credentials_returns_basic_challenge():
    with pytest.raises(HTTPException) as error:
        await get_principal(basic=None, db=AsyncMock())
    assert error.value.status_code == 401
    assert error.value.headers == {"WWW-Authenticate": 'Basic realm="chematsustain"'}