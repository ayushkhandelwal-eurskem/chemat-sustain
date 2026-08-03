# Tenant Isolation Design & Migration Plan — Phase 5

Date: 2026-08-03. Based on the **live production schema and data**, inspected directly (19 users, 327 tests).

Two layers of tenant protection, as mandated: application-level filtering from the verified token claim, plus PostgreSQL Row-Level Security as an independent backstop that holds even when application code has a bug.

---

## BLOCKING PREREQUISITE — the application must stop connecting as a superuser

Measured on production:

```
current_user = postgres,  usesuper = t
pg_roles:      postgres | rolsuper=t | rolbypassrls=t
table owners:  tests, users, sessions, categories, protocols, protocol_tests → all owned by postgres
```

**PostgreSQL superusers unconditionally bypass Row-Level Security, and a table owner bypasses it unless `FORCE ROW LEVEL SECURITY` is set.** As configured, RLS policies would parse, deploy, and enforce *nothing* — and naively written tests would appear to pass. This is the single most important thing to get right in this phase; everything else in it is decoration without it.

Required:

1. Create a dedicated login role `chemat_app` — **not** superuser, **not** `BYPASSRLS`, and **not** the table owner.
2. Grant it only `SELECT/INSERT/UPDATE/DELETE` on tenant tables, and `SELECT/INSERT` only on `audit_events` (append-only enforced by grant, not convention).
3. Apply `FORCE ROW LEVEL SECURITY` as belt-and-braces so ownership changes can't silently re-open the bypass.
4. Point the backend at `chemat_app` — **this changes `DATABASE_URL`** and is a deployment coordination item (see `deployment-readiness.md`).
5. Keep `postgres` for migrations and break-glass admin only, never for request handling.

A verification test asserting `current_user` is non-superuser and `rolbypassrls = false` is part of the test plan, so a regression here fails CI rather than silently disabling isolation.

---

## Organisation model

Every consortium organisation is a tenant. `organisations.slug` is the canonical tenant key and **must equal the Keycloak Organization alias**, because the access token's `organisation_id` claim carries that alias (verified in Phase 4: a client-credentials token returned `"organisation_id": "eurskem"`). Using the same string end-to-end avoids a translation layer that could drift.

The 11 partners, from https://chematsustain.eu/partners/:

| slug | Organisation | Acronym | Country |
|---|---|---|---|
| `haw` | University of Applied Sciences Hamburg | HAW | Germany |
| `ulodz` | University of Lodz | ULODZ | Poland |
| `eurskem` | EURSKEM B.V. | EKE | Netherlands |
| `tul` | Lodz University of Technology | TUL | Poland |
| `dtu` | Technical University of Denmark | DTU | Denmark |
| `unibo` | Alma Mater Studiorum-Università di Bologna | UNIBO | Italy |
| `protoqsar` | ProtoQSAR | PQSAR | Spain |
| `uniurb` | Università degli studi di Urbino Carlo Bo | UNIURB | Italy |
| `ivl` | Swedish Environmental Research Institute | IVL | Sweden |
| `awi` | Alfred Wegener Institute | AWI | Germany |
| `mmu` | Manchester Metropolitan University | MMU | United Kingdom |

Plus one non-partner tenant:

| slug | Purpose |
|---|---|
| `unassigned` | Quarantine holding tenant. Has **no members**, so nothing in it is reachable by any partner. Any record that cannot be confidently attributed lands here rather than being guessed into a real tenant. Fail-closed by construction. |

---

## Mapping 1 — existing users → organisations (NEEDS SIGN-OFF)

19 users across 7 email domains. **Do not auto-apply**: rows 6 and 7 cannot be derived from data.

| # | Email domain | Users | Role | Proposed organisation | Confidence |
|---|---|---|---|---|---|
| 1 | `p.lodz.pl` | 10 | user | `tul` — Lodz University of Technology | High (partner site: `iim.p.lodz.pl`) |
| 2 | `chemia.uni.lodz.pl` | 3 | user | `ulodz` — University of Lodz | High (partner site: `uni.lodz.pl`) |
| 3 | `eurskem.com` | 2 | admin | `eurskem` — EURSKEM B.V. | High |
| 4 | `mmu.ac.uk` | 1 | user | `mmu` — Manchester Metropolitan University | High |
| 5 | `chemia.uni.lodz` | 1 | user | `ulodz` (assumed) | **Medium — malformed domain**, missing `.pl`. Likely a data-entry error. Confirm before applying. |
| 6 | `gmail.com` | 1 | **admin** | ??? | **Cannot derive.** Personal address holding an admin role. |
| 7 | `proton.me` | 1 | **admin** | ??? | **Cannot derive.** Personal address holding an admin role. |

⚠️ **The Lodz trap.** `p.lodz.pl` and `uni.lodz.pl` are **two different institutions** — Lodz University of Technology and the University of Lodz respectively. Any fuzzy match on "lodz" would merge them and cross-contaminate 13 of the 19 users. The mapping above keeps them distinct deliberately; please confirm.

⚠️ **Rows 6–7 are two of the four admin accounts.** They must be assigned explicitly by name, not by rule. Until assigned they go to `unassigned`, which means they lose data access — intentional, since the alternative is guessing an organisation for a privileged account.

## Mapping 2 — existing tests → organisations (data-derived, reviewable)

All 327 test records carry a partner attribution at `test_details->'work_package'->>'partner'`. **Zero records are unattributed**, so this backfill is derived from the data rather than inferred:

| Partner value in data | Tests | → organisation |
|---|---|---|
| `ULODZ` | 147 | `ulodz` |
| `AWI` | 76 | `awi` |
| `TUL` | 48 | `tul` |
| `UNIURB` | 40 | `uniurb` |
| `UniUrb` | 16 | `uniurb` (case variant — normalise via `upper()`) |
| **Total** | **327** | |

Notes worth flagging before this is applied:

- **`AWI` owns 76 tests but has no users** in the system, and **`UNIURB` owns 56 with no users** either. After tenant scoping those 132 records become invisible to everyone until users are provisioned in those organisations. Correct fail-closed behaviour, but it will look like data loss if unexpected.
- **`MMU` and `EURSKEM` have users but no tests.** Those users will see nothing until data is attributed to them or sharing is introduced.
- **All 327 tests are `is_public = false`.** Nothing is currently consortium-visible, so the restricted-data three-stage approval requirement (API owner → data owner → security) applies to effectively the entire dataset.
- Only 4 of 11 partners have produced data so far.

## What is tenant-scoped vs shared

| Table | Decision | Rationale |
|---|---|---|
| `tests` | **Tenant-scoped** (`organisation_id NOT NULL`) | Core research data; owned by the producing partner. |
| `protocols` | **Tenant-scoped** | Carries attached SOP files. Currently 0 rows in production, so no backfill risk. |
| `protocol_tests` | **Tenant-scoped** | Link table; inherits the protocol's tenant. |
| `users` | **Tenant-scoped** | Every identity belongs to exactly one organisation. |
| `sessions` | **Tenant-scoped** (via user) | Legacy; retired after the OIDC cutover. |
| `categories` | **Shared reference data — deliberately NOT tenant-scoped** | The three rows are a consortium-wide taxonomy ("Human Toxicity", "Physico-Chemical Characteristics", "Uncategorized"), not anyone's data. Per-tenant copies would fragment the shared vocabulary. This is a deliberate deviation from "add `organisation_id` to tree nodes" — recorded here rather than made silently. Categories are readable by all, writable only by `platform_admin`. |
| `users_import` | **Drop or quarantine** | An undocumented leftover table found on production, presumably from a manual import. Not referenced by application code. Needs a decision; not touched by these migrations. |

---

## API credential registry (`oauth_clients`)

This is the "separate way to record that information" with enable/disable/delete from the admin section.

```
oauth_clients
  id                  UUID PK
  client_id           TEXT UNIQUE NOT NULL     -- matches the Keycloak client
  organisation_id     UUID NOT NULL FK         -- the tenant this credential acts as
  display_name        TEXT NOT NULL
  description         TEXT
  status              TEXT NOT NULL            -- 'enabled' | 'disabled' | 'revoked'
  client_secret_hash  TEXT                     -- hash only; never plaintext, never redisplayed
  secret_issued_at    TIMESTAMPTZ
  secret_expires_at   TIMESTAMPTZ              -- drives expiry warnings
  created_by          TEXT NOT NULL            -- Keycloak subject of the issuer
  created_at          TIMESTAMPTZ NOT NULL
  last_used_at        TIMESTAMPTZ              -- populated from token validation
  disabled_at/by/reason
  revoked_at/by/reason
```

Admin actions map to: **enable** → `status='enabled'`; **disable** → `status='disabled'` (reversible); **delete** → `status='revoked'` (terminal, row retained for audit — never a hard `DELETE`, because the audit trail must survive).

### Three things to get right, given "the keys can go to anyone"

1. **Every credential is bound to exactly one `organisation_id`.** Whoever holds the secret acts as that organisation and sees exactly that organisation's data. This is the intended property, and it is why the binding lives in the token (Phase 4) and not in a request parameter.
2. **A secret must never be shared between organisations.** If partner A hands its credentials to partner B, B silently gains A's data access and the audit trail attributes B's actions to A. Issue one client per application per organisation; the admin UI should state this and the developer terms should forbid sharing.
3. **A `status='disabled'` row in our database does not, by itself, stop anything.** Keycloak issues the tokens. Disabling must be enforced in at least one place that actually gates access:
   - **Authoritative:** call the Keycloak Admin API to disable/delete the client, so no new tokens are issued.
   - **Defence in depth:** have the backend check `oauth_clients.status` on every request, keyed on the token's `azp`, so a Keycloak/registry desync fails closed.
   - Implement **both**. Already-issued tokens stay valid until expiry; the 300-second access-token lifetime bounds that window, which is precisely why short tokens matter.

## Published / public data

The consortium deliberately releases some data, and the schema already carries a **two-level** model for it (all flags currently `false` on all 327 production rows):

| Level | Column(s) | Granularity |
|---|---|---|
| Row | `tests.is_public` | Is this test released beyond its owning organisation at all |
| Field | `release_test_details`, `release_raw_data`, `release_processed_data`, `release_final_results`, `release_statistical_analysis` | Which parts of a released test are exposed |

RLS is row-level, so it enforces level 1 only (migration `005`):

- **Read:** `organisation_id = current_org_id() OR is_public` — no tenant context required, because **`is_public` means public on the internet**. Anonymous access to released data is an existing product feature (`/tests/public/` and the catalogue endpoints serve unauthenticated callers by design).
- **Write:** `organisation_id = current_org_id()` — always strict. Publication never confers write access, so a partner can never reach another partner's row by flipping flags; it cannot touch that row at all. Verified: a `tul` context sees a published `ulodz` row but updates 0 of them.

The security invariant is narrower than "nothing without a context", and it holds: an unscoped connection sees **only published rows, never unpublished ones**, because `current_org_id()` is NULL without context so the first clause matches nothing.

> An earlier draft of this document asserted that "public" meant consortium-public and added a `current_org_id() IS NOT NULL` guard to the read policy. That was wrong — it would have broken anonymous access to released data — and has been reverted. The clarification is what prompted a proper review of the anonymous read paths, which immediately surfaced a **live critical vulnerability**: `GET /tests/{id}`, `/tests/name/{name}` and `/tests/work-package/{name}` had no authentication, no `is_public` filter and no field masking, exposing all 327 restricted records in production. See `incident-2026-08-unauthenticated-data-exposure.md`.

**Publication is a governed action.** Releasing data is effectively irreversible once others hold copies, so a database trigger rejects any change to `is_public` or a `release_*` flag outside a governance context (set only when the verified token carries `data_owner`/`api_owner`/`security_approver`/`platform_admin`). Verified: an ordinary `tul` context attempting to publish its *own* row is rejected; the same change succeeds under a governance context. Note this trigger fires for superusers too — unlike RLS, triggers are not superuser-bypassed — so it cannot be sidestepped by connecting as `postgres`.

**Field-level masking is implemented** in `mask_test_for_public()` (`backend/api/services/test.py`), the single place that decision is made, since RLS cannot mask columns. Each field is returned only if its `release_*` flag is set, and `file_path` is always withheld. Verified end-to-end: a record published with only `release_final_results` returns `final_results` to an anonymous caller and withholds the other four payloads plus the file path.

## Other Phase 5 tables

Included now (needed for partner access): `organisations`, `organisation_memberships`, `keycloak_identities`, `oauth_clients`, `api_scopes`, `access_requests`, `approval_decisions`, `active_grants`, `revocations`, `audit_events`.

`approval_decisions` records **actor, the role used, decision, reason, timestamp, requested scopes, tenant, expiry** — with the role recorded explicitly, so the same person holding `api_owner`, `data_owner` and `security_approver` produces three separate, independently attributable decisions rather than one collapsed "admin approved".

Deferred (not needed to serve APIs; Phase 8 portal work): `api_definitions`/`api_versions` for the catalogue, `developer_applications` as a layer above `oauth_clients`. `data_classifications` starts as a constrained column rather than its own table.

---

## Migration sequence (safe order — each step reversible until the last)

| # | File | Action | Risk |
|---|---|---|---|
| 1 | `001_tenant_foundation.sql` | Create portal tables + the 11 organisations + `unassigned`. Create `chemat_app` role and grants. | None — purely additive. |
| 2 | `002_add_organisation_id.sql` | Add `organisation_id` **nullable** to tenant tables. | None — nullable, no data touched. |
| 3 | `003_backfill_organisation_id.sql` | Backfill from Mapping 1 + 2. Anything unmatched → `unassigned`. Prints a reconciliation report. | Data-modifying. **Requires the backup verified in `deployment-readiness.md`.** Gated on sign-off of Mapping 1. |
| 4 | `004_enforce_tenancy.sql` | `SET NOT NULL`, enable + **force** RLS, apply policies. | Behaviour-changing: unscoped queries start returning nothing. Run only after step 3 reconciles cleanly. |

Splitting 3 and 4 means the backfill can be inspected and corrected before enforcement makes mistakes user-visible.

## RLS policy shape

Tenant context is set per transaction by the backend from the **verified token claim only**:

```sql
SET LOCAL app.current_org = '<organisation_id claim from the validated JWT>';
```

```sql
CREATE POLICY tenant_isolation ON tests
  USING (organisation_id = (SELECT id FROM organisations
                            WHERE slug = current_setting('app.current_org', true)));
```

`current_setting(..., true)` returns NULL when unset, so the comparison is NULL, so **no rows are visible** — an unscoped connection sees nothing rather than everything. `SET LOCAL` scopes it to the transaction, so a pooled connection cannot leak context between requests. `FORCE ROW LEVEL SECURITY` keeps it applying to the table owner.

## Test plan (Phase 5 exit criteria)

1. `current_user` is non-superuser with `rolbypassrls = false` — guards the whole mechanism.
2. Two-tenant fixture: org A's context cannot read, update, or delete org B's rows in `tests`, `protocols`, `protocol_tests`, `users`.
3. No tenant context set ⇒ zero rows (fail-closed), not all rows.
4. Context set to a non-existent slug ⇒ zero rows.
5. `SET LOCAL` does not survive the transaction — verifies no cross-request leakage on a pooled connection.
6. `audit_events` rejects `UPDATE` and `DELETE` as `chemat_app` at the **grant** level.
7. Backfill reconciliation: post-migration counts per organisation exactly match Mapping 2 (147/76/48/56), and no tenant table retains a NULL `organisation_id`.
8. Cross-tenant negative tests run in CI and fail the build (per the brief's CI gates).
