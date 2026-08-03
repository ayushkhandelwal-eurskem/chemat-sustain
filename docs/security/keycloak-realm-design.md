# Keycloak Realm Design — Phase 4

Realm: `chematsustain`. Built and verified via the Admin REST API (`keycloak/build_realm.py`), then exported to `keycloak/realm-export.json`, which both `docker-compose-dev.yml` and `docker-compose.yml` import on first boot (`start[-dev] --import-realm`). Re-importing an existing realm is a no-op for already-present data — this file is the *initial bootstrap*, not a live sync mechanism; ongoing realm changes should go through the admin console/API and get re-exported deliberately.

## Why Keycloak's native Organizations feature, not Groups

The engagement brief allows either "managed organisations or groups." Keycloak 26.7 ships a native `ORGANIZATION` feature (confirmed enabled on this build), purpose-built for exactly this multi-tenant scenario, with a dedicated `oidc-organization-membership-mapper` protocol mapper. This is used instead of a groups-based workaround. Each consortium partner is a Keycloak Organization; every user/service-account's token carries an `organisation_id` claim resolved from Organization membership via this mapper (`addOrganizationId: true`), verified end-to-end (see below). **The application must only ever trust this token claim for tenant scoping — never a client-supplied header, query parameter, or body field.**

Two organisations exist in the baseline export: `eurskem` (consortium coordinator) and `example-partner` (an explicit placeholder — replace or remove during real partner onboarding, don't mistake it for a real partner).

## Roles

`platform_admin`, `api_owner`, `data_owner`, `security_approver`, `organisation_admin`, `researcher`, `developer`, `auditor` — matching `docs/security/role-permission-matrix.md`. A ninth role, `requires_mfa`, is a technical marker (see MFA section) — not a business role, never assign it directly.

## Client scopes (Phase 1 API scopes)

`tests:read`, `experimental-data:read`, `protocol-files:read`, `protocol-files:download`, `files:navigate`, `files:read`, `audit:read-own-organisation` — optional client scopes, requested explicitly per access grant (Phase 6 wires the approval workflow that governs who gets which).

## Audience

Access tokens get an explicit `chematsustain-api` audience via an `oidc-audience-mapper` on the `organisation` default client scope (alongside Keycloak's own default `account` audience). The backend validates `aud` strictly against `chematsustain-api` — verified to reject tokens lacking it (see negative-test results below).

## Clients

- **`portal-frontend`** — public client, Authorization Code + PKCE (S256) only. `directAccessGrantsEnabled: false`, `implicitFlowEnabled: false` — no legacy/insecure flows. Redirect URIs cover local dev ports and `https://database.eurskem.com/*`.
- **`m2m-test-client`** — confidential, `serviceAccountsEnabled: true`, Client Credentials flow only (`standardFlowEnabled: false`). An example/reference M2M client, not a stand-in for real partner API clients — those get created per-application during real onboarding (Phase 6/8). Its secret is **not** in the committed export (Keycloak generates a fresh one per deployment; the admin regenerates it via console/API after import — never commit a working secret).

## Authentication: MFA enforcement

A copy of the built-in `browser` flow (`browser-with-conditional-mfa`, bound as the realm's `browserFlow`) adds a "Privileged Role MFA" conditional subflow after the username/password form: if the authenticated user has any of `platform_admin`/`api_owner`/`data_owner`/`security_approver`, OTP verification becomes required. This is implemented via a composite role, `requires_mfa`, added as a composite *of* each privileged role (not the reverse — composite roles expand from the composite to its members, so the marker role must be composed *into* each privileged role for a user holding just one of them to inherit it). A `conditional-user-role` execution checks for `requires_mfa`; confirmed via the Admin API that a user granted `platform_admin` correctly shows `requires_mfa` in their effective/composite role set.

The built-in "Organization Identity-First Login" branch (auto-added when Organizations are enabled) was disabled — it's a sibling *alternative* to the branch containing the MFA subflow at the top level of the flow, and if it fully authenticates a user on its own, no other alternative (including ours) is evaluated. Self-service org selection at login isn't needed here since organisation membership is admin-assigned, not user-chosen.

**Verification status — read carefully:** the flow's structure was verified correct via the Admin REST API (execution tree, requirement levels, composite-role resolution, and the realm's `browserFlow` binding all confirmed as expected on both the live instance and a fresh `--import-realm` from the committed export). Attempting to verify the *interactive* trigger (does a privileged login actually get prompted for OTP) via scripted HTTP calls against the real login pages was inconclusive in this session — Keycloak issues its auth-session cookies with the `Secure` attribute even over the plain-HTTP dev endpoint, which a script-based client without a real browser doesn't reliably reproduce, and the debugging session surfaced a testing-harness bug (`"code=" in url` matching the ever-present `response_type=code` query parameter, not an actual issued authorization code) that produced misleading "success" readings partway through. **This must be confirmed with a real browser (or Playwright/Cypress in Phase 9) before relying on it for production** — it is not yet proven end-to-end the way the JWT-validation matrix below is.

## Backend OIDC resource-server validation — fully verified

`backend/utils/oidc.py` validates Bearer tokens against Keycloak's JWKS (signature, issuer, audience, expiry, required claims), extracts `organisation_id`/roles/scopes into a `Principal`, and provides `require_scope`/`require_role` deny-by-default dependencies. Verified against the live realm with a full positive/negative matrix:

| Case | Expected | Result |
|---|---|---|
| No `Authorization` header | 401 | ✅ |
| Valid token, no scope requirement | 200, correct claims | ✅ |
| Valid token + required scope present | 200 | ✅ |
| Valid token, required scope absent | 403 | ✅ |
| Tampered signature | 401 | ✅ |
| Malformed token | 401 | ✅ |
| Wrong issuer (token from `master` realm) | 401 | ✅ |
| Wrong/missing audience (client without the `organisation` scope) | 401 | ✅ |
| Expired token (realm token lifespan temporarily set to 1s) | 401 | ✅ |

## Not yet done (tracked for later phases)

- Frontend Authorization Code + PKCE integration (this phase, in progress after this doc).
- Interactive MFA trigger confirmation via real browser/Playwright (Phase 9).
- Wiring real API routes to `require_scope`/`require_role` and tenant scoping (Phase 6/7 — this phase only proves the validation mechanism itself works).
- Production Keycloak: DNS for `auth.eurskem.com` and confirming the origin certificate covers it (see `nginx/default.conf` comment) — infrastructure this environment has no access to provision.
