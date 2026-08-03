# Current-state security assessment

## Baseline findings

| Area | Previous state | Secure-foundation response |
|---|---|---|
| Identity | Local password, email OTP and long-lived cookie sessions | Keycloak OIDC Authorization Code + PKCE; client credentials for machines |
| Secrets | SMTP app password in source | Removed; environment-only configuration; scanning added |
| Logging | OTP and bootstrap password printed | Sensitive prints removed; generic client errors |
| Tenancy | No organisation boundary | Immutable token claim, tenant columns, application filters and PostgreSQL RLS |
| Authorization | `admin` / `user`, several unguarded routes | Deny-by-default roles and OAuth scopes; legacy APIs disabled in production |
| Files | Paths joined from URL values | Tenant roots, canonical resolution, traversal/symlink controls, safe download names |
| Audit | No security audit trail | Append-only organisation chain with HMAC tamper evidence |
| Schema | Automatic `create_all` at startup | Disabled by default; reviewed SQL migrations |
| CI | No security gate | Tests, secret scan, dependency audit, SAST, image scan and SBOM |

## Critical external blocker

The SMTP credential previously committed to the public repository must be revoked/rotated. Source removal does not invalidate the old credential or erase Git history. Use `incident-and-credential-rotation.md` before calling the incident contained.

## Residual risks

- Existing data is inaccessible in secure mode until ownership is reviewed and backfilled.
- Keycloak configuration must be independently reviewed after import.
- HMAC chaining detects audit changes but should be complemented by external immutable export.
- Distributed rate limiting should be enforced at the gateway or shared store; in-process limits are insufficient across replicas.
- Malware scanning for uploads is an environment integration, not included in this source-only package.
