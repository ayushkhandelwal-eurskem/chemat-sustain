# Phase 1 API inventory

| Endpoint | Scope | Classification | Notes |
|---|---|---|---|
| `GET /api/v1/tests` | `tests:read` | Consortium | Tenant-filtered research test summary |
| `GET /api/v1/experimental-data/{id}` | `experimental-data:read` | Restricted | Full experimental payload; audited |
| `GET /api/v1/protocols` | `protocol-files:read` | Consortium | Tenant protocol metadata |
| `GET /api/v1/protocols/{id}/download` | `protocol-files:download` | Consortium | Tenant-bound, audited download |
| `GET /api/v1/files` | `files:navigate` | Consortium | Names and metadata beneath tenant root |
| `/api/v1/portal/*` | Role/scopes per action | Internal | Catalogue, apps, approvals, grants and audit |

User-management and system-administration APIs are not part of Phase 1. Existing endpoints outside `/api/v1` are legacy compatibility routes and must remain disabled in production with `ENABLE_LEGACY_API=false`.
