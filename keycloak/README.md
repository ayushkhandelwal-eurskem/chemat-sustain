# Keycloak realm provisioning

`realm-export.json` is imported automatically on first boot by both `docker-compose-dev.yml` and `docker-compose.yml` (`start[-dev] --import-realm`). Re-importing over an existing realm does not overwrite live data - this file is the initial bootstrap only.

## Rebuilding the realm from scratch

`build_realm.py` is the source of truth for the realm's *structure* - it provisions roles, organisations, client scopes, clients, and protocol mappers via the Admin REST API. Run it against a running Keycloak with an empty/placeholder realm already present:

```bash
export KEYCLOAK_URL=http://localhost:8082
export KEYCLOAK_ADMIN_USERNAME=...   # from your local .env
export KEYCLOAK_ADMIN_PASSWORD=...
pip install requests
python3 build_realm.py
```

## Re-exporting after changes

After making changes (via the script or the admin console), export the realm and sanitize it before committing:

```python
# Never commit this without stripping client secrets and user credentials -
# see the checks performed in the Phase 4 session, summarized here:
# 1. POST /admin/realms/chematsustain/partial-export?exportClients=true&exportGroupsAndRoles=true
# 2. Null out every client's "secret" field and drop "id" fields
# 3. Fetch /admin/realms/chematsustain/organizations separately and add as
#    the "organizations" key - partial-export does not include them
# 4. Confirm the "users" array contains only service-account identities
#    (users whose serviceAccountClientId is set) and no real user with a
#    password/credential
# 5. Confirm sslRequired is "external" (not "none") before committing -
#    "none" is only ever a temporary local-testing convenience
```

## Local admin-API testing convenience

Keycloak enforces `sslRequired: external` on both `master` and `chematsustain` by default, which rejects token requests made directly over plain HTTP (e.g. via `curl http://localhost:8082/...` without going through a TLS-terminating proxy). For local scripting/testing only:

```bash
docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user <admin-user> --password <admin-password>
docker exec keycloak /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=none
docker exec keycloak /opt/keycloak/bin/kcadm.sh update realms/chematsustain -s sslRequired=none
# ... do your testing ...
docker exec keycloak /opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=external
docker exec keycloak /opt/keycloak/bin/kcadm.sh update realms/chematsustain -s sslRequired=external
```

Always restore `external` afterward - never leave `none` set, and never let it leak into a committed export.

## MFA verification caveat

See `docs/security/keycloak-realm-design.md` — the conditional-MFA-by-role flow is structurally verified via the Admin API but its *interactive* trigger was not conclusively confirmed via automated browser simulation in this session. Confirm with a real browser (or Playwright in Phase 9) before relying on it.
