# Production environment variables

Every value below was checked against `backend/security/config.py`,
`backend/security/auth.py`, `keycloak/realm-export.json` and the live
`auth.eurskem.com` discovery document on 2026-08-03. Defaults that are wrong for
this deployment are called out explicitly — several of them fail silently.

File: `/home/chematsustain/.env` on the server (loaded by `env_file` in
`docker-compose.yml`).

---

## Read this before setting `APP_ENV=production`

`APP_ENV=production` is **not** a hardening flag you can switch on safely today.
`Settings.validate()` makes it imply two other things:

```
if is_production and auth_mode  != "keycloak":     raise
if is_production and enable_legacy_api:            raise
```

So `APP_ENV=production` forces `AUTH_MODE=keycloak` **and**
`ENABLE_LEGACY_API=false`. The second one removes these routers from the app
(`backend/app.py`):

| Router dropped | What stops working |
|---|---|
| `/tests/*` | the website's entire data layer |
| `/users/*` | **login, sessions, password change** |
| `/files/*` | file navigation and downloads |
| tree, protocol-files, tree-admin | protocol browsing, admin tree |

The site currently runs on those endpoints. Setting `APP_ENV=production` before
the frontend has moved to `/api/v1/*` and OIDC login would take the whole
platform down, and the backend would refuse to boot if `AUTH_MODE` were still
`legacy`.

**Set the Stage 1 block now. Set Stage 2 only as a planned cutover.**

---

## Stage 1 — safe to set today

Nothing here changes runtime behaviour except closing the docs exposure.

```dotenv
# --- Close the public API schema ------------------------------------------
# /docs, /redoc and /openapi.json were serving 38 endpoints anonymously.
# The default is already false; set it explicitly so intent is recorded.
ENABLE_API_DOCS=false

# --- CORS: exact origin, no wildcard --------------------------------------
# Default is http://localhost:3000, which is wrong for production.
# validate() rejects "*" outright.
CORS_ORIGINS=https://database.eurskem.com

# --- File paths must match the docker-compose bind mounts -----------------
# TENANT_DATA_ROOT defaults to /data/tenants, which is NOT mounted. Anything
# written there lives in the container's writable layer and is destroyed by the
# next `docker compose up --build` - the failure that already lost research
# files once, leaving 327 test rows pointing at 24 surviving files.
PROTOCOL_FILE_DIR=/app/protocol_files
TENANT_DATA_ROOT=/app/data

# --- Audit hash-chain key -------------------------------------------------
# Required once APP_ENV=production; harmless before then. Setting it now means
# the cutover cannot fail on a missing key.
# Generate with:  openssl rand -hex 32
# Store a copy in your password manager - rotating it breaks chain continuity.
AUDIT_HMAC_KEY=<paste 64 hex chars from openssl rand -hex 32>

# --- Keycloak: inert while AUTH_MODE=legacy, required at cutover ----------
# REALM: the config default is "chemat-sustain". Your realm is "chematsustain",
# with no hyphen. The default points at a realm that does not exist.
KEYCLOAK_REALM=chematsustain
KEYCLOAK_ISSUER=https://auth.eurskem.com/realms/chematsustain
KEYCLOAK_JWKS_URL=https://auth.eurskem.com/realms/chematsustain/protocol/openid-connect/certs

# AUDIENCE: must equal the `aud` claim your tokens actually carry. That comes
# from the `organisation` client scope's `chematsustain-api-audience` mapper.
# auth.py sets verify_aud=True, so a wrong value here 401s every request.
KEYCLOAK_AUDIENCE=chematsustain-api

# ALLOWED_AZP: browser-facing clients, comma separated. Empty by default.
KEYCLOAK_ALLOWED_AZP=portal-frontend

# MACHINE_AZP_PREFIX: default is "chemat-app-", which matches none of the
# clients you would create. Partner machine clients are named partner-<alias>.
# auth.py rejects with 403 "Token client is not authorised" when azp matches
# neither ALLOWED_AZP nor this prefix.
KEYCLOAK_MACHINE_AZP_PREFIX=partner-

# --- Admin API provisioning: leave OFF unless actively provisioning -------
ENABLE_KEYCLOAK_PROVISIONING=false
KEYCLOAK_ADMIN_BASE_URL=http://keycloak:8080

# --- Legacy OTP and password-reset email ---------------------------------
# Existing-services configuration: Cloudflare Email Routing forwards the
# database@eurskem.com verification address to Gmail, where that From alias
# must be verified under Accounts and Import > Send mail as.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_SENDER=database@eurskem.com
SMTP_USERNAME=ayush.us255@gmail.com
SMTP_PASSWORD=<stored only in /home/chematsustain/.env>
SMTP_GMAIL_ALIAS_VERIFIED=true
```

`SMTP_GMAIL_ALIAS_VERIFIED=true` is an operator assertion, not a switch that
creates the alias. Set it only after completing
[Existing Cloudflare + Gmail sender setup](cloudflare-gmail-alias-setup.md).
Without Gmail verification, the provider rewrites or rejects the From address.
Google says third-party Send-as support ends in January 2027; migrate to the
durable [Cloudflare outbound email setup](cloudflare-email-setup.md) before then.

`KEYCLOAK_ADMIN_BASE_URL` must stay on the internal Docker address. The public
`/admin` path is blocked at nginx, so an external URL would 403.

### Verify Stage 1

```bash
docker compose exec backend python -c "
from security.config import get_settings as g
s = g()
print('env            ', s.environment)
print('api_docs       ', s.enable_api_docs, '  (must be False)')
print('cors           ', s.cors_origins)
print('realm          ', s.keycloak_realm, ' (must be chematsustain)')
print('audience       ', s.keycloak_audience)
print('allowed_azp    ', s.keycloak_allowed_azp)
print('machine_prefix ', s.keycloak_machine_azp_prefix)
print('tenant_root    ', s.tenant_data_root, ' (must be /app/data)')
print('audit_key_set  ', bool(s.audit_hmac_key))
"
```

Then confirm the schema is gone. All three must be 404:

```bash
for p in /api/docs /api/redoc /api/openapi.json; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "https://database.eurskem.com$p"
done
```

---

## Stage 2 — the cutover (do not set piecemeal)

Only when the frontend is on OIDC and `/api/v1/*`, and the 19 legacy users exist
in Keycloak with organisation memberships.

```dotenv
APP_ENV=production
AUTH_MODE=keycloak
ENABLE_LEGACY_API=false
ENABLE_AUTO_DDL=false
DATABASE_URL=postgresql+asyncpg://chemat_app:<password>@db:5432/<dbname>
```

`ENABLE_LEGACY_API` defaults to **true**, so it must be set false explicitly.
`ENABLE_AUTO_DDL` already defaults to false; set it for the record.

`DATABASE_URL` switching to `chemat_app` is what makes RLS actually enforce.
Until then the app connects as a superuser and **every RLS policy is bypassed** —
the policies are correct and tested, but inert in production. Order matters:
migrations 001→003 must have run and `chemat_app` must have a password first.

### Pre-cutover gate

Do not proceed unless all of these hold:

- [ ] Migrations 001, 002, 003 applied to the production database
- [ ] `chemat_app` has a password, and `verify_rls.sql` run **as `chemat_app`** reports RLS enabled and forced
- [ ] 303 dangling `tests.file_path` rows reconciled
- [ ] 19 legacy users exist in Keycloak with organisation memberships
- [ ] Frontend login goes through OIDC, verified against a staging build
- [ ] `/api/v1/tests` returns data for a real partner token
- [ ] A fresh backup taken and a **restore actually tested**
- [ ] Rollback rehearsed: revert `.env`, `docker compose up -d`, force-recreate nginx

---

## Gotchas, ranked by how quietly they fail

| # | Trap | Symptom |
|---|---|---|
| 1 | `organisation` client scope missing on a hand-made client | 401 (no `aud`) or 403 (no `organisation_id`) — the client looks perfectly configured |
| 2 | `KEYCLOAK_REALM` left at default `chemat-sustain` | provisioning silently targets a non-existent realm |
| 3 | `KEYCLOAK_AUDIENCE` mismatch | every authenticated call 401s |
| 4 | `KEYCLOAK_MACHINE_AZP_PREFIX` left at `chemat-app-` | 403 "Token client is not authorised" for every partner client |
| 5 | `TENANT_DATA_ROOT` left at default | uploads vanish on the next rebuild |
| 6 | `DATABASE_URL` still the superuser | RLS present but bypassed — tests pass, production isn't protected |
| 7 | `APP_ENV=production` set early | backend refuses to boot, or site goes dark |

Trap 1 is the worst: nothing in the admin console warns you, and the failure
appears to be a code problem rather than a configuration one. See
[../portal/admin-access-guide.md](../portal/admin-access-guide.md) §5.

---

## Never put in this file

`.env` is not committed and must stay that way. Also keep out of Git, images, CI
logs and documentation: `POSTGRES_PASSWORD`, `KEYCLOAK_DB_PASSWORD`,
`KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_ADMIN_CLIENT_SECRET`, `AUDIT_HMAC_KEY`,
`SMTP_PASSWORD`, and the Cloudflare origin key.

Realm exports are secrets too — they carry client configuration and, depending on
export options, secrets.
