#!/usr/bin/env python3
"""Provisions the CheMatSustain Keycloak realm via the Admin REST API.

This is the source of truth for the realm's *structure* (roles,
organisations, client scopes, clients, protocol mappers, authentication
flow). The resulting realm-export.json (produced separately via the
partial-export endpoint) is what docker-compose actually imports on first
boot - this script is how that file gets built/rebuilt, not something CI
or the app runs at runtime.

Tenant model: uses Keycloak's native Organizations feature (not groups) -
every consortium partner is a Keycloak Organization, and every user's
token carries an `organisation_id` claim resolved from their Organization
membership via a protocol mapper. The application must only ever trust
this token claim for tenant scoping, never a client-supplied value.

Usage:
    KEYCLOAK_URL=http://localhost:8082 \
    KEYCLOAK_ADMIN_USERNAME=... KEYCLOAK_ADMIN_PASSWORD=... \
    python3 build_realm.py

Never hardcode real credentials here - everything comes from the
environment, matching every other secret in this project.
"""
import os
import sys
import requests

KC_URL = os.environ["KEYCLOAK_URL"].rstrip("/")
ADMIN_USER = os.environ["KEYCLOAK_ADMIN_USERNAME"]
ADMIN_PASSWORD = os.environ["KEYCLOAK_ADMIN_PASSWORD"]
REALM = "chematsustain"

ROLES = [
    "platform_admin", "api_owner", "data_owner", "security_approver",
    "organisation_admin", "researcher", "developer", "auditor",
]
PRIVILEGED_ROLES = {"platform_admin", "api_owner", "data_owner", "security_approver"}

SCOPES = [
    "tests:read", "experimental-data:read", "protocol-files:read",
    "protocol-files:download", "files:navigate", "files:read",
    "audit:read-own-organisation",
]

ORGANISATIONS = [
    # (name/alias, domain, description)
    ("eurskem", "eurskem.com", "Consortium coordinator"),
    ("example-partner", "example-partner.invalid", "Placeholder partner org - replace during real partner onboarding"),
]


def get_admin_token():
    resp = requests.post(
        f"{KC_URL}/realms/master/protocol/openid-connect/token",
        data={
            "client_id": "admin-cli",
            "username": ADMIN_USER,
            "password": ADMIN_PASSWORD,
            "grant_type": "password",
        },
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def api(session, method, path, **kwargs):
    url = f"{KC_URL}/admin/realms/{REALM}{path}"
    resp = session.request(method, url, **kwargs)
    if resp.status_code not in (200, 201, 204, 409):
        print(f"  ! {method} {path} -> {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
    return resp


def main():
    token = get_admin_token()
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

    print("Enabling Organizations feature on the realm...")
    api(session, "PUT", "", json={"organizationsEnabled": True})

    print("Creating realm roles...")
    for role in ROLES:
        api(session, "POST", "/roles", json={"name": role, "description": f"CheMatSustain role: {role}"})

    print("Creating client scopes (Phase 1 API scopes)...")
    for scope in SCOPES:
        api(session, "POST", "/client-scopes", json={
            "name": scope,
            "protocol": "openid-connect",
            "attributes": {"include.in.token.scope": "true", "display.on.consent.screen": "true"},
        })

    print("Creating an 'organisation' default client scope with the org-id mapper...")
    api(session, "POST", "/client-scopes", json={
        "name": "organisation",
        "protocol": "openid-connect",
        "attributes": {"include.in.token.scope": "false", "display.on.consent.screen": "false"},
    })
    scopes = session.get(f"{KC_URL}/admin/realms/{REALM}/client-scopes").json()
    org_scope_id = next(s["id"] for s in scopes if s["name"] == "organisation")
    api(session, "POST", f"/client-scopes/{org_scope_id}/protocol-mappers/models", json={
        "name": "organisation-id",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-organization-membership-mapper",
        "config": {
            "claim.name": "organisation_id",
            "jsonType.label": "String",
            "multivalued": "false",
            "addOrganizationId": "true",
            "addOrganizationAttributes": "false",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
        },
    })

    print("Creating organisations...")
    for name, domain, desc in ORGANISATIONS:
        api(session, "POST", "/organizations", json={
            "name": name,
            "alias": name,
            "enabled": True,
            "description": desc,
            "domains": [{"name": domain, "verified": False}],
        })

    print("Creating clients...")
    api(session, "POST", "/clients", json={
        "clientId": "portal-frontend",
        "publicClient": True,
        "protocol": "openid-connect",
        "standardFlowEnabled": True,
        "directAccessGrantsEnabled": False,
        "implicitFlowEnabled": False,
        "serviceAccountsEnabled": False,
        "redirectUris": [
            "http://localhost:3000/*", "http://localhost:3001/*", "http://localhost:8080/*",
            "https://database.eurskem.com/*",
        ],
        "webOrigins": ["http://localhost:3000", "http://localhost:3001", "https://database.eurskem.com"],
        "attributes": {"pkce.code.challenge.method": "S256"},
        "defaultClientScopes": ["profile", "email", "roles", "organisation"],
        "optionalClientScopes": SCOPES,
    })

    api(session, "POST", "/clients", json={
        "clientId": "m2m-test-client",
        "publicClient": False,
        "protocol": "openid-connect",
        "standardFlowEnabled": False,
        "directAccessGrantsEnabled": False,
        "serviceAccountsEnabled": True,
        "defaultClientScopes": ["profile", "email", "roles", "organisation"],
        "optionalClientScopes": SCOPES,
    })

    print("Done.")


if __name__ == "__main__":
    main()
