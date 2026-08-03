# Role-and-Permission Matrix — Phase 1 scope

Roles map to Keycloak realm roles (Phase 4) and are carried as claims in the access token. `organisation_id` is always a separate claim scoping every role to the caller's own tenant — a `researcher` in org A never gets org B's data regardless of role.

## Roles

| Role | Description | Assigned by |
|---|---|---|
| `platform_admin` | Operates the platform itself: Keycloak realm config, infrastructure, global settings. Not a data-access role. | Existing platform_admin (bootstrap: ayush.khandelwal@eurskem.com) |
| `api_owner` | Owns one or more published APIs; approves/rejects/reduces access requests against APIs they own. | platform_admin |
| `data_owner` | Owns the data classification decisions for a dataset; second approval stage for restricted-data access requests. | platform_admin |
| `security_approver` | Final approval stage for restricted-data access requests; owns security-relevant policy. | platform_admin |
| `organisation_admin` | Manages their own organisation's members, applications, and OAuth clients. Cannot see other organisations. | platform_admin (one per onboarding organisation) |
| `researcher` | Reads/downloads approved research data and protocol files within their own organisation. | organisation_admin |
| `developer` | Registers applications, requests API scopes, manages credentials for their own organisation's apps. | organisation_admin |
| `auditor` | Read-only access to their own organisation's audit history. No data-plane access. | organisation_admin |

Per the engagement brief, `ayush.khandelwal@eurskem.com` initially holds `platform_admin`, `api_owner`, `data_owner`, and `security_approver` as four **separate** role grants. Every approval action records which role performed it — never a generic "admin approved this" — even when the same person holds all four (see the approval-workflow audit shape in Phase 6).

## Phase 1 scopes

| Scope | Grants |
|---|---|
| `tests:read` | Read test records (metadata + results) within own organisation, respecting `is_public`/classification. |
| `experimental-data:read` | Read raw/processed/final experimental data attached to a test. |
| `protocol-files:read` | Read protocol/SOP metadata. |
| `protocol-files:download` | Download the actual protocol file binary (separate from metadata read — see file-security requirements). |
| `files:navigate` | Browse the tenant-scoped file/folder tree. |
| `files:read` | Read file contents/metadata under the tenant-scoped tree. |
| `audit:read-own-organisation` | Read audit history scoped to the caller's own organisation only. |

Restricted-classification data additionally requires all three of: `api_owner` approval, `data_owner` approval, `security_approver` approval, in that order, before the corresponding grant is provisioned (Phase 6).

## Role × capability matrix

Legend: **F** = full, **O** = own-organisation only, **–** = none.

| Capability | platform_admin | api_owner | data_owner | security_approver | organisation_admin | researcher | developer | auditor |
|---|---|---|---|---|---|---|---|---|
| Manage Keycloak realm / global platform config | F | – | – | – | – | – | – | – |
| Publish / version / deprecate an API | – | F (own APIs) | – | – | – | – | – | – |
| Approve API-owner stage of an access request | – | F (own APIs) | – | – | – | – | – | – |
| Set/change a dataset's classification | – | – | F (own datasets) | – | – | – | – | – |
| Approve data-owner stage of an access request | – | – | F (own datasets) | – | – | – | – | – |
| Approve security stage of an access request | – | – | – | F | – | – | – | – |
| Approve/reduce/reject any access-request stage they don't own | – | – | – | – | – | – | – | – |
| Manage own organisation's members/roles | – | – | – | – | O | – | – | – |
| Register a developer application | – | – | – | – | O | – | O | – |
| Request API scopes for an application | – | – | – | – | O | – | O | – |
| Issue / rotate / revoke own org's OAuth client credentials | – | – | – | – | O | – | O | – |
| Read tests/experimental data (own org, per classification + grant) | – | – | – | – | O | O | – | – |
| Download protocol files (own org, per grant) | – | – | – | – | O | O | – | – |
| Navigate/read tenant file tree (own org, per grant) | – | – | – | – | O | O | O | – |
| Read own organisation's audit history | – | – | – | – | O | – | – | O |
| Read another organisation's anything | – | – | – | – | – | – | – | – |
| Approve own access request (self-approval) | – | – | – | – | – | – | – | – |

Every "–" in the "own-org" rows for roles that shouldn't see cross-tenant data is enforced twice: once by the scope/role check in the FastAPI dependency layer (Phase 6, deny-by-default) and once independently by Postgres Row-Level Security (Phase 5) — see threat model §1–2 for why both layers matter.

## Separation-of-duties rule

A single natural person may hold multiple roles (as `ayush.khandelwal@eurskem.com` does at bootstrap), but the system must never let the *same role grant* be used to satisfy more than one stage of a multi-stage approval, and must never let a requester's own identity match the actor on any stage of their own request — enforced in Phase 6 regardless of how many roles that actor happens to hold.
