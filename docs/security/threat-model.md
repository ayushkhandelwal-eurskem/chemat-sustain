# CheMatSustain Developer Portal — STRIDE Threat Model

Date: 2026-08-02. Scope: the target multi-tenant Developer Portal architecture (Keycloak + FastAPI resource server + Postgres RLS), assessed against the current-state gaps documented in `current-state-assessment.md`. Each threat lists affected assets, attack path, preventive controls (the ones this engagement will build), detection controls, test cases, residual risk, and the responsible owner role.

Legend for owner roles: `platform_admin`, `api_owner`, `data_owner`, `security_approver`, `organisation_admin`.

---

## 1. Cross-tenant data leakage (Information Disclosure)

- **Assets:** all tenant-owned rows (tests, experimental data, protocol files, tree nodes, file metadata).
- **Attack path:** Partner org A's authenticated user requests a resource belonging to org B, either directly (guessing/enumerating an ID) or indirectly (a query missing a tenant filter, a cache key not scoped by tenant, a bug in application-layer filtering).
- **Preventive controls:** `organisation_id` derived only from the verified JWT claim (never from request body/header/query — Phase 5); Postgres Row-Level Security policy on every tenant-owned table as a second, independent enforcement layer that holds even if application code has a bug (Phase 5); tenant-aware cache keys; object storage paths isolated per tenant.
- **Detection controls:** audit log alert on any RLS policy violation (Postgres logs denied rows); anomaly alert on a user's requests spanning multiple `organisation_id` values.
- **Test cases:** two-tenant fixture where org A's token is used against org B's resource IDs at every read/write endpoint — must return 404 (not 403, to avoid confirming existence) for all of them; RLS unit test connecting as the app role with `SET app.current_org` forced to a different tenant than the row's owner.
- **Residual risk:** Low if both layers are enforced; Medium if only one layer exists (single point of failure).
- **Owner:** `data_owner` (control design), `security_approver` (sign-off).

## 2. Broken object-level authorization (Elevation of Privilege / Information Disclosure)

- **Assets:** individual test records, protocol files, tree nodes addressed by numeric ID.
- **Attack path:** Authenticated user increments/guesses an ID (`/tests/{id}`, `/protocols/{id}/file`) belonging to another organisation or another user without sufficient scope. Confirmed live today in `test.py`, `router_tree_admin.py`, `router_protocol_files.py` — **zero auth dependency on any write endpoint** (see current-state assessment §3).
- **Preventive controls:** deny-by-default FastAPI dependency requiring both a valid scope and organisation match, checked on every request and every object (Phase 6); RLS as the DB-layer backstop (Phase 5).
- **Detection controls:** 403/404 rate monitoring per client; alert on repeated sequential ID probing from one client.
- **Test cases:** every mutating endpoint tested with (a) no token, (b) valid token wrong scope, (c) valid token/scope but object in another org.
- **Residual risk:** Currently Critical (live, unauthenticated). Target: Low once Phase 6/7 land.
- **Owner:** `api_owner`.

## 3. Privilege escalation via role/scope tampering (Elevation of Privilege)

- **Assets:** role assignments, OAuth scopes, approval workflow state.
- **Attack path:** Client-supplied role/org/scope values trusted instead of the verified token claims (mass assignment on user-editable fields); a developer self-approves their own access request; a reduced role's cached permission is used after downgrade.
- **Preventive controls:** roles/scopes/org come only from Keycloak token claims, never from request body; explicit separation of duties in the approval workflow (a requester cannot be one of the three approvers for their own request — Phase 6); short-lived tokens so a role downgrade takes effect quickly; session/token invalidation on role change.
- **Detection controls:** audit alert if an approval's `actor` equals the access request's `requester`; alert on any role change immediately followed by a sensitive-scope API call.
- **Test cases:** attempt self-approval → must be rejected; attempt to submit `role` or `organisation_id` fields in a profile-update body → must be ignored/rejected; use a token minted before a role downgrade → must fail once expired/revoked.
- **Residual risk:** Low with short-lived tokens + explicit separation-of-duties checks.
- **Owner:** `security_approver`.

## 4. Token theft and replay (Spoofing / Information Disclosure)

- **Assets:** OIDC access/refresh tokens, client credentials.
- **Attack path:** Token exfiltrated via XSS, insecure storage (`localStorage`), logs, or a misconfigured redirect URI; replayed against the resource server.
- **Preventive controls:** Authorization Code + PKCE (no implicit flow) for the Next.js frontend; tokens never written to `localStorage`/`sessionStorage` (in-memory + httpOnly refresh cookie); strict redirect URI allow-list in the Keycloak client config; short-lived access tokens (target ≤15 min) with rotated refresh tokens; strict CSP to blunt XSS; audience/issuer/signature/expiry validation on every request (Phase 4).
- **Detection controls:** alert on token use from a wildly different IP/geo within an implausible time window (impossible-travel heuristic); refresh-token reuse detection (rotation family revocation).
- **Test cases:** expired token, wrong-audience token, wrong-issuer token, tampered-signature token, replayed refresh token after rotation — all must be rejected.
- **Residual risk:** Medium (XSS on the frontend remains the main residual vector; mitigated but not eliminated by CSP).
- **Owner:** `security_approver`, `platform_admin`.

## 5. Malicious or over-privileged API client (Elevation of Privilege / Tampering)

- **Assets:** Phase 1 data APIs, machine-to-machine credentials.
- **Attack path:** A registered application requests broader scopes than its stated business purpose; a compromised client credential is used to bulk-exfiltrate data beyond normal usage patterns.
- **Preventive controls:** three-stage approval (API owner → data owner → security) required for any restricted-scope grant (Phase 6); quotas/rate limits per client (Phase 7); time-bound grants with periodic review and automatic expiry.
- **Detection controls:** usage-analytics alert on a client's request volume/scope pattern deviating from its approved baseline; quota-breach alert.
- **Test cases:** client requests a scope it was never granted → 403; client exceeds its rate limit → 429 with correct headers; expired grant → 403 even with a technically-valid token.
- **Residual risk:** Medium — a fully compromised, still-within-quota credential is hard to distinguish from legitimate use without behavioural baselining, which is out of scope for Phase 1 APIs.
- **Owner:** `api_owner`, `data_owner`.

## 6. Path traversal / arbitrary file read (Tampering / Information Disclosure)

- **Assets:** `backend/data/` and `backend/protocol_files/` on the backend filesystem.
- **Attack path:** Confirmed live today — `file_navigator.py` joins unsanitized user input directly into `BASE_DIR` with `os.path.join`, no traversal/symlink/null-byte/Unicode-normalization checks (current-state assessment §4).
- **Preventive controls:** resolve every requested path with `Path.resolve()` and verify it is a descendant of the tenant's approved root directory before any filesystem call; reject `..`, encoded traversal, null bytes, and symlink targets that escape the root; never expose absolute server paths in responses (Phase 7).
- **Detection controls:** audit log every rejected traversal attempt with actor + raw requested path; alert on repeated attempts from one actor.
- **Test cases:** `../../etc/passwd`, URL-encoded (`%2e%2e%2f`) and double-encoded variants, null-byte injection (`file.pdf%00.exe`), symlink pointing outside the tenant root, malformed Unicode normalization tricks — all must be rejected with a generic error, not a stack trace.
- **Residual risk:** Currently Critical (live). Target: Low once Phase 7 lands.
- **Owner:** `api_owner`.

## 7. SQL injection (Tampering)

- **Assets:** Postgres database.
- **Attack path:** Raw string interpolation into a query. Current code uses SQLAlchemy Core/ORM with parameterized queries throughout the reviewed controllers/services — no raw string-formatted SQL was found in application code during this assessment.
- **Preventive controls:** continue exclusive use of the SQLAlchemy query builder/ORM (no raw SQL string interpolation); SAST rule specifically flagging f-string/`.format()`/`%`-interpolated SQL (Phase 3); code-review gate.
- **Detection controls:** Postgres query anomaly logging (statements with unusual shape); WAF SQLi ruleset at the gateway layer as defence-in-depth.
- **Test cases:** injection payloads (`' OR 1=1--`, stacked queries, time-based blind payloads) against every parameterized endpoint input.
- **Residual risk:** Low today given ORM-only usage; must be maintained via the SAST gate as new code is added (especially the upcoming RLS/tenant-context `SET` statements, which need care since session variables can't always be parameterized the same way — must use `set_config()` with bound parameters, not string formatting).
- **Owner:** `api_owner`.

## 8. XSS and CSRF against the Portal UI (Tampering / Spoofing)

- **Assets:** Next.js frontend, session cookies, any state-changing action.
- **Attack path:** Stored/reflected XSS in a portal page (e.g. rendering an API description, a support message, or a file name without escaping) executes in another user's session; CSRF forces an authenticated browser to submit a state-changing request cross-site.
- **Preventive controls:** framework-default output escaping (React/Next.js escapes by default — enforce no `dangerouslySetInnerHTML` on user-controlled content via lint rule); strict CSP; `SameSite=Lax`/`Strict` cookies (already set for the legacy session cookie; carry forward for any portal-issued cookie); CSRF token or double-submit cookie for any cookie-authenticated state-changing endpoint (note: pure bearer-token API calls are not CSRF-vulnerable, but the browser-facing portal's own session-management endpoints are).
- **Detection controls:** CSP violation reporting endpoint; anomalous-origin request monitoring.
- **Test cases:** stored XSS payloads in every free-text field surfaced to other users (API descriptions, application names, support messages); CSRF test submitting a state-changing request from a foreign origin without the token.
- **Residual risk:** Low with the above controls consistently applied.
- **Owner:** `security_approver`.

## 9. Credential leakage (Information Disclosure)

- **Assets:** SMTP credential, OAuth client secrets, database credentials, Keycloak admin credentials.
- **Attack path:** Materialized in Phase 1 — hard-coded SMTP app password committed to a public repo; also found a historical SQL data dump with real session tokens and restricted research data (see `incident-2026-08-credential-and-data-exposure.md`).
- **Preventive controls:** gitleaks in CI + pre-commit (Phase 1, done); no secrets in source/logs/analytics/URLs; client secrets shown only once at issuance, stored only as a hash thereafter (Phase 4/6); environment-variable/secret-store-based config throughout.
- **Detection controls:** CI fails the build on any detected secret; periodic re-scan of full history (not just new commits).
- **Test cases:** CI pipeline test asserting a deliberately-planted fake secret in a test commit is caught and blocks the pipeline.
- **Residual risk:** Low, contingent on gitleaks coverage staying current and pre-commit hooks not being bypassed (`--no-verify`).
- **Owner:** `platform_admin`.

## 10. Excessive API access via over-broad scope grants (Elevation of Privilege)

- **Assets:** all Phase 1 data APIs.
- **Attack path:** An approval is granted for broader scopes than requested/needed, or a grant is never revoked after the underlying need ends (stale access).
- **Preventive controls:** approvers can reduce (not just approve/reject) requested scopes (Phase 6); grants are time-bound where appropriate with periodic automated review and automatic removal on expiry (Phase 6).
- **Detection controls:** quarterly access-review report of all active grants per organisation; alert on a grant approaching its `is_public`/classification mismatch (e.g. restricted-scope grant with no expiry set).
- **Test cases:** grant with an expiry in the past must be rejected at request time; expired grant must be auto-revoked and subsequently denied.
- **Residual risk:** Medium — depends on approvers actually exercising scope reduction in practice, which is a process control as much as a technical one.
- **Owner:** `data_owner`.

## 11. Audit-log manipulation (Repudiation / Tampering)

- **Assets:** the audit trail itself.
- **Attack path:** A compromised admin or a bug allows an audit record to be altered or deleted after the fact, undermining accountability for approvals, credential actions, and access decisions.
- **Preventive controls:** append-only audit table (`INSERT`-only DB permission for the application role, no `UPDATE`/`DELETE` grant at the database level, not just application-level convention — Phase 6); every record carries actor, action, target, org, timestamp, result, correlation ID, and — for privileged changes — a reason; audit writes happen in the same transaction as the action they record (or via an outbox pattern) so they can't silently be skipped.
- **Detection controls:** periodic hash-chain or checksum verification job over the audit table to detect any out-of-band tampering (e.g. direct DB edit bypassing the app); alert on any failed `INSERT`-only constraint violation attempt.
- **Test cases:** attempt `UPDATE`/`DELETE` on an audit row as the application DB role → must fail at the database grant level, not just be blocked in application code; verify an audit record exists for every action in the required list (§4.7 of the master spec) via an integration test that performs each action and asserts the corresponding audit row.
- **Residual risk:** Low with DB-level `INSERT`-only enforcement; a `platform_admin` with raw DB superuser access is a residual risk addressed by §12 below, not by the application.
- **Owner:** `platform_admin`, `security_approver`.

## 12. Compromised administrator account (Elevation of Privilege)

- **Assets:** everything — a compromised `platform_admin`/`security_approver` account is close to a full compromise.
- **Attack path:** Phished or credential-stuffed admin login; session/token theft of a privileged session.
- **Preventive controls:** MFA mandatory for all four privileged roles (platform_admin, api_owner, data_owner, security_approver) at the Keycloak realm level; phishing-resistant WebAuthn/passkey option for these roles; step-up re-authentication for the most sensitive actions (credential revocation, role grants, policy changes); dual approval for the most critical operations where appropriate; time-limited privileged access rather than standing admin sessions.
- **Detection controls:** alert on any privileged action from a new device/location; alert on MFA method changes for privileged accounts; session-anomaly detection.
- **Test cases:** privileged action attempted without a recent step-up auth → rejected; MFA-disabled admin login attempt → rejected at the Keycloak policy level.
- **Residual risk:** Medium — irreducible to some degree for any system with admin accounts; mitigated, not eliminated, by the above.
- **Owner:** `security_approver`, `platform_admin`.

## 13. Keycloak compromise or misconfiguration (Elevation of Privilege / Spoofing)

- **Assets:** the entire authentication/authorization trust root.
- **Attack path:** Misconfigured realm (e.g. public client where confidential is required, overly permissive redirect URIs, disabled token signature verification, weak default admin credentials on first boot); direct compromise of the self-hosted Keycloak instance.
- **Preventive controls:** no default credentials in the Keycloak realm export (explicit engagement requirement); confidential clients for all server-side flows, public clients only where PKCE is used; strict redirect URI allow-lists; regular Keycloak version/patch updates tracked via dependency scanning; realm export reviewed as part of the PR for Phase 4; Keycloak itself placed behind the same network/TLS controls as the rest of the stack.
- **Detection controls:** Keycloak's own admin-event and login-event logging forwarded to the platform's audit/observability pipeline; alert on realm configuration changes.
- **Test cases:** attempt to use a public client for a confidential-client flow → rejected; attempt token exchange with a redirect URI not on the allow-list → rejected; verify no realm-export credential is a placeholder/default value via a CI check.
- **Residual risk:** Medium-High if Keycloak patching lags; this is an ongoing operational responsibility, not a one-time fix.
- **Owner:** `platform_admin`.

## 14. Backup disclosure (Information Disclosure)

- **Assets:** database backups, file-storage backups.
- **Attack path:** Confirmed pattern already occurred once — a database dump (`cms_backup_2026-06-06.sql`) was committed to source control and publicly exposed (Phase 1 incident). Backups stored insecurely (unencrypted, over-broad access, in source control, in a public object-storage bucket) are an equally sensitive asset as the live database.
- **Preventive controls:** backups never committed to source control (this is now covered by gitleaks pattern rules plus a `.gitignore` entry, and by process — backups belong in a dedicated backup location, verified in this session at `~/chemat-sustain-backups/`, outside the repo); backup encryption at rest; access restricted to platform_admin; documented retention/deletion policy.
- **Detection controls:** gitleaks/CI scan rule for common dump-file patterns (`*.sql`, `*backup*`) as a backstop even though process should prevent this; periodic access-log review on the backup storage location.
- **Test cases:** CI test that a commit adding a `*.sql` dump file outside the reviewed schema/seed files is flagged for manual review.
- **Residual risk:** Low with the above, contingent on discipline around where backups are ever written to disk during ad-hoc operations (exactly the mistake that caused the Phase 1 incident).
- **Owner:** `platform_admin`.

## 15. Insider misuse (Elevation of Privilege / Repudiation)

- **Assets:** all tenant data, all administrative functions.
- **Attack path:** A legitimate consortium-partner user or an internal admin exceeds their approved purpose-of-use, e.g. bulk-exporting another organisation's restricted data they were never meant to see beyond a narrow approved scope, or a support engineer browsing customer data without a ticket justification.
- **Preventive controls:** least-privilege scopes tied to actual business need (not broad roles); purpose-of-use and time-bound restrictions on grants (Phase 6); support staff never given unrestricted customer-data access — impersonation, where needed, is time-limited, logged, and requires a reason (§9 of the master spec, Phase 8 admin areas); every data export logged with actor + reason.
- **Detection controls:** anomaly detection on bulk-export volume vs. an actor's historical baseline; alert on any support-impersonation session without a linked ticket/reason.
- **Test cases:** support-role account attempting a data export without impersonation/reason context → rejected; bulk export exceeding a configured threshold → requires additional approval or is flagged for review.
- **Residual risk:** Medium — this category is only partially a technical problem; process and audit visibility are the main levers, and full prevention isn't realistically achievable through code alone.
- **Owner:** `data_owner`, `security_approver`.

---

## Cross-cutting note on residual risk

Several of the above list "Critical, currently live" residual risk for items already confirmed exploitable today (§2, §6). These are the two single highest-priority items for Phase 7 and are explicitly called out in the current-state assessment's priority ranking. Everything else describes risk in the *target* architecture, not necessarily an active exploit today, since the corresponding controls (Keycloak, RLS, audit layer) don't exist yet in the current codebase.
