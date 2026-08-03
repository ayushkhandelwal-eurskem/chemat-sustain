# Role and scope matrix

| Capability | platform_admin | organisation_admin | api_owner | data_owner | security_approver | developer | researcher | auditor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Register application | Yes | Yes | — | — | — | Yes | — | — |
| Request scopes | Yes | Yes | — | — | — | Yes | — | — |
| API-owner approval | Break-glass | — | Yes | — | — | — | — | — |
| Data-owner approval | Break-glass | — | — | Yes | — | — | — | — |
| Security approval/revocation | Break-glass | — | — | — | Yes | — | — | — |
| Read approved research APIs | By scope | By scope | By scope | By scope | By scope | By scope | By scope | By scope |
| Read own-tenant audit | By scope | By scope | By scope | By scope | By scope | — | — | `audit:read-own-organisation` |

Restricted data requires three distinct approval records: `api_owner`, `data_owner`, and `security_approver`. The same subject may initially hold all three roles, but each decision, reason and timestamp is recorded separately.
