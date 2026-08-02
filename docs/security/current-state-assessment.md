# CheMatSustain — Current-State Security Assessment

Date: 2026-08-02
Scope: `backend/`, `frontend/`, deployment config, as of branch `security/credential-containment`.
Purpose: ground truth for the Developer Portal security build. Every finding below was verified by reading the actual code, not inferred from documentation.

## 1. Summary

The application is a single-tenant research-data platform with a homegrown session-cookie authentication system. There is no concept of organisations/tenants anywhere in the schema. Several write and file-access endpoints have no authentication at all. One hard-coded credential and one historical data dump were found and remediated in Phase 1 (see `docs/security/incident-2026-08-credential-and-data-exposure.md`). This document catalogues what remains before the platform can safely support the multi-tenant Developer Portal described in the engagement brief.

## 2. Authentication — current implementation

`backend/utils/auth.py` implements a custom session system:
- Password hash via `passlib`/bcrypt (sound).
- Login flow: password check → OTP emailed (5-minute TOTP window, `pyotp`) → session row created in Postgres (`api/models/session.py`) → opaque `session_id` (32-byte urlsafe token) set as an HttpOnly cookie.
- No refresh-token rotation, no JWT, no OIDC, no MFA beyond the always-on email OTP, no WebAuthn/passkeys, no step-up auth for sensitive actions.
- Single `role` enum column on `User` (`admin` / other) — no scopes, no per-resource permissions, no organisation concept.
- `SESSION_COOKIE_SECURE` now defaults to `true` (fixed in Phase 1; was hard-coded `false`).

This entire system is superseded by the target architecture (Keycloak OIDC + PKCE + JWT resource-server validation, Phase 4) and will be replaced, not incrementally patched.

## 3. Authorization gaps found (live, unauthenticated write/read paths)

These are currently exploitable by any unauthenticated caller against the deployed backend. Verified by reading the router source directly — none of the following have `Depends(get_current_user)` or any other auth dependency:

| Endpoint(s) | File | Exposure |
|---|---|---|
| `POST/PUT/DELETE /tests`, `PATCH /tests/{id}/publish`, `PATCH /tests/{id}/unpublish`, `PATCH /tests/bulk-release-flags` | `backend/api/controllers/test.py` | Anyone can create, modify, delete, publish/unpublish, or bulk-release-flag research test records — the platform's core data. |
| `POST/PATCH/DELETE /categories`, `/protocols`, `/protocol-tests`, including `/move` and `/rename` | `backend/api/router_tree_admin.py` | Anyone can restructure the entire protocol/test navigation tree. File carries an explicit `# TODO: gate behind write-auth` comment acknowledging this. |
| `POST/GET/DELETE /protocols/{id}/file` | `backend/api/router_protocol_files.py` | Anyone can upload, download, or delete a protocol SOP file for any protocol ID. Same acknowledged TODO. |
| `GET /tree` | `backend/api/router_tree.py` | Read-only tree metadata, no auth — lower severity but still unrestricted. |

By contrast, `backend/api/controllers/file_navigator.py` (folder browsing under `data/`) *does* require `get_current_user` at the router level — but see §4 for why that protection is largely moot.

**Root cause:** these routers were built incrementally with `# TODO: gate this behind your write-auth dependency before going public` comments that were never resolved before the code reached production.

## 4. Path traversal — `file_navigator.py`

`BASE_DIR = os.path.join(os.getcwd(), "data")`, and every route joins user-supplied path segments (`folder_name`, `subfolder_name`, `nested_subfolder`, `file_name`) directly via `os.path.join` with **no normalization, no traversal rejection, no containment check**. `os.path.join(base, "../../etc")` happily escapes `base`. There is no defense against:
- `../` sequences (including encoded `%2e%2e%2f`)
- absolute path injection (`os.path.join` silently discards `base` if a later argument is itself absolute)
- symlink escapes
- null bytes / malformed Unicode

This is a full directory-traversal vulnerability, gated only by requiring *a* valid login (any authenticated user, not scoped to their own data — there is no tenant concept to scope to yet). Fixed properly in Phase 7, alongside adding tenant scoping.

## 5. Tenant / multi-tenancy

There is no `organisation_id` (or equivalent) column anywhere in the schema — not on `users`, not on `tests`, not on the tree tables, not on protocol files. The application is architecturally single-tenant today. This is the largest gap relative to the target architecture and is addressed in Phase 5 (data model + Row-Level Security).

## 6. Secrets and credential handling

- Phase 1 fixed the hard-coded SMTP app password, admin-password logging, and OTP/session-id logging (see `docs/security/incident-2026-08-credential-and-data-exposure.md`).
- `.env` is correctly gitignored and was never committed.
- `docker-compose.yml` / `docker-compose-dev.yml` use `env_file`/`environment: ${VAR}` correctly — no hard-coded credentials found there.
- No secrets manager / KMS is in use; all config is plain environment variables. Acceptable for the current scale but should move toward a dedicated secrets store (or at minimum documented rotation procedures) as the Keycloak/OAuth-client-secret surface grows in Phase 4+.

## 7. CI/CD

`.github/workflows/deploy.yml` (pre-existing, unchanged by this engagement per instructions) performs an unconditional SSH deploy to IONOS on every push to `main` — no tests, no build gate, no security scanning of any kind ran before Phase 1. `.github/workflows/security.yml` (added in Phase 1) adds gitleaks secret scanning only. Phase 3 expands this with SAST, dependency scanning, SBOM generation, and container scanning, and — critically — **decouples security scanning from the auto-deploy trigger** is out of scope to change (`deploy.yml` itself is explicitly off-limits per the engagement brief), but new gating should run on every PR so issues are caught before merge to `main`.

## 8. Data classification (informal, current)

No formal data-classification scheme exists in code today. Based on the schema and usage:

| Data | Classification (proposed) | Current protection |
|---|---|---|
| Test records (`tests` table: raw/processed/final results, statistical analysis) | Restricted (consortium-confidential) unless `is_public=true` | None (unauthenticated CRUD, see §3) |
| Protocol/SOP files | Confidential | None (unauthenticated upload/download, see §3) |
| User credentials (password hash, OTP secret) | Highly restricted | Bcrypt hash at rest; OTP secret stored in plaintext in DB column (acceptable — it's a shared-secret TOTP seed, not a password, and is cleared after successful verification) |
| Session tokens | Restricted | Opaque, HttpOnly cookie; DB-backed with expiry |

This is formalized as part of the data model work in Phase 5.

## 9. Frontend

`frontend/src/lib/axios.ts` only branches on `NODE_ENV`; no token storage strategy is implemented yet since the current backend uses cookies, not bearer tokens. Phase 4 introduces the OIDC Authorization Code + PKCE flow and needs an explicit decision on token storage (in-memory + httpOnly refresh cookie, not `localStorage`).

## 10. What Phase 1 already fixed (not re-listed as open findings)

- Hard-coded Gmail SMTP app password → environment variable, credential rotated.
- Admin-password / OTP-code / OTP-secret / session-id logging removed; structured redacted logging added.
- Raw exception details no longer returned to API clients (`file_navigator.py`, `test.py` parse errors).
- `.env.example` added; gitleaks secret scanning added to CI and pre-commit.
- Historical SQL data dump (real session tokens + 87 restricted test records + partner-institution researcher emails) purged from git history and force-pushed.

## 11. Priority ranking for remaining work

1. **Critical:** unauthenticated write endpoints (§3) — anyone can currently corrupt or exfiltrate all research data and protocol files.
2. **Critical:** path traversal in file navigation (§4).
3. **High:** no tenant isolation (§5) — required before any consortium partner can be onboarded at all.
4. **High:** homegrown auth with no MFA enforcement, no scopes (§2) — required to meet the stated Keycloak/MFA requirement.
5. **Medium:** CI has no SAST/dependency/container scanning yet (§7).
6. **Medium:** no formal data classification or audit trail (§8).

These map directly onto Phases 3–7 of the agreed delivery order.
