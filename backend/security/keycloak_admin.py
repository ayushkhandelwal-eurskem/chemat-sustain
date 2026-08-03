"""Minimal Keycloak Admin API client for machine-client lifecycle.

The administrative service-account secret comes from the environment. Client
secrets returned by Keycloak are sent once to the caller and never persisted.
"""

from __future__ import annotations

import httpx
from fastapi import HTTPException, status

from .config import get_settings


class KeycloakProvisioner:
    def __init__(self) -> None:
        self.settings = get_settings()
        if not self.settings.enable_keycloak_provisioning:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Credential provisioning is disabled")

    async def _admin_token(self, client: httpx.AsyncClient) -> str:
        response = await client.post(
            f"{self.settings.keycloak_admin_base_url}/realms/{self.settings.keycloak_realm}/protocol/openid-connect/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.settings.keycloak_admin_client_id,
                "client_secret": self.settings.keycloak_admin_client_secret,
            },
        )
        response.raise_for_status()
        return response.json()["access_token"]

    async def ensure_client(
        self, application_id: str, organisation_id: str, scopes: list[str]
    ) -> tuple[str, str]:
        client_id = f"chemat-app-{application_id}"
        timeout = httpx.Timeout(10.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            try:
                token = await self._admin_token(client)
                headers = {"Authorization": f"Bearer {token}"}
                lookup = await client.get(
                    f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/clients",
                    headers=headers,
                    params={"clientId": client_id},
                )
                lookup.raise_for_status()
                matches = lookup.json()
                if matches:
                    internal_id = matches[0]["id"]
                    await client.put(
                        f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/clients/{internal_id}",
                        headers=headers,
                        json={
                            **matches[0],
                            "enabled": True,
                            "serviceAccountsEnabled": True,
                            "standardFlowEnabled": False,
                            "directAccessGrantsEnabled": False,
                            "attributes": {
                                **matches[0].get("attributes", {}),
                                "organisation_id": organisation_id,
                                "approved_scopes": " ".join(sorted(scopes)),
                            },
                        },
                    ).raise_for_status()
                else:
                    created = await client.post(
                        f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/clients",
                        headers=headers,
                        json={
                            "clientId": client_id,
                            "enabled": True,
                            "publicClient": False,
                            "bearerOnly": False,
                            "serviceAccountsEnabled": True,
                            "standardFlowEnabled": False,
                            "directAccessGrantsEnabled": False,
                            "protocol": "openid-connect",
                            "attributes": {
                                "organisation_id": organisation_id,
                                "approved_scopes": " ".join(sorted(scopes)),
                            },
                        },
                    )
                    created.raise_for_status()
                    internal_id = created.headers["Location"].rstrip("/").split("/")[-1]

                # Service-account tokens inherit the immutable tenant claim
                # from the generated service-account user's attributes.
                service_account = await client.get(
                    f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/clients/{internal_id}/service-account-user",
                    headers=headers,
                )
                service_account.raise_for_status()
                service_user = service_account.json()
                service_user["attributes"] = {
                    **service_user.get("attributes", {}),
                    "organisation_id": [organisation_id],
                }
                await client.put(
                    f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/users/{service_user['id']}",
                    headers=headers,
                    json=service_user,
                ).raise_for_status()

                available_scopes = await client.get(
                    f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/client-scopes",
                    headers=headers,
                )
                available_scopes.raise_for_status()
                by_name = {item["name"]: item["id"] for item in available_scopes.json()}
                for scope in scopes:
                    scope_id = by_name.get(scope)
                    if scope_id:
                        response = await client.put(
                            f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/clients/{internal_id}/default-client-scopes/{scope_id}",
                            headers=headers,
                        )
                        if response.status_code not in {204, 409}:
                            response.raise_for_status()

                rotated = await client.post(
                    f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/clients/{internal_id}/client-secret",
                    headers=headers,
                )
                rotated.raise_for_status()
                secret = rotated.json()["value"]
                return client_id, secret
            except (httpx.HTTPError, KeyError) as exc:
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY,
                    "Identity-provider provisioning failed",
                ) from exc

    async def disable_client(self, client_id: str) -> None:
        timeout = httpx.Timeout(10.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            try:
                token = await self._admin_token(client)
                headers = {"Authorization": f"Bearer {token}"}
                response = await client.get(
                    f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/clients",
                    headers=headers,
                    params={"clientId": client_id},
                )
                response.raise_for_status()
                matches = response.json()
                if matches:
                    record = {**matches[0], "enabled": False}
                    await client.put(
                        f"{self.settings.keycloak_admin_base_url}/admin/realms/{self.settings.keycloak_realm}/clients/{record['id']}",
                        headers=headers,
                        json=record,
                    ).raise_for_status()
            except httpx.HTTPError as exc:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Identity-provider revocation failed") from exc
