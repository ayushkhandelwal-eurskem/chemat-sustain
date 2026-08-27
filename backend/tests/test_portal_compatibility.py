from unittest.mock import AsyncMock

import pytest

from api.router_portal import me
from security.auth import Principal


@pytest.mark.asyncio
async def test_portal_me_preserves_local_api_client_verification_contract():
    principal = Principal(
        subject="api-client:cms_test",
        email=None,
        organisation_id="org-1",
        roles=frozenset({"service_account"}),
        scopes=frozenset({"tests:read"}),
        client_id="cms_test",
        token_id=None,
    )
    response = await me(principal)
    assert response["client_id"] == "cms_test"
    assert response["organisation_id"] == "org-1"
    assert response["scopes"] == ["tests:read"]
    assert "client_secret" not in response