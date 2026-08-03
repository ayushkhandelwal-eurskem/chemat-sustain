# Security test strategy and traceability

## Automated gates

| Control | Test/evidence | Blocking condition |
|---|---|---|
| Token signature/claims | `backend/tests/test_auth.py` | Any invalid-token case accepted |
| Tenant path boundary | `backend/tests/test_files.py` | Traversal or symlink escape succeeds |
| Audit tamper evidence | `backend/tests/test_audit.py` | Modified payload/chain keeps same digest |
| Fail-closed configuration | `backend/tests/test_config.py` | Production accepts legacy/auto-DDL/wildcard CORS |
| Secret exposure | Gitleaks pre-commit and CI | Any unapproved finding |
| Python vulnerabilities | `pip-audit`, Bandit | Unresolved high/critical without exception |
| Frontend vulnerabilities | `npm audit --omit=dev` | Production high/critical finding |
| Container vulnerabilities | Trivy | High/critical finding |
| Supply-chain record | CycloneDX SBOM | SBOM generation fails |

Security-critical token and path modules target at least 80% branch coverage. More important than the percentage: every role, scope, tenant and file decision path must have a positive and negative test.

## Isolated-environment tests still required

- Apply/reverse/reapply migrations to a production-shaped database copy.
- Two tenant fixtures with same-shaped object identifiers.
- Direct SQL RLS reads/writes as tenant A, tenant B, unconfigured session and migration owner.
- Keycloak human Code+PKCE, MFA enrolment, logout and session expiry.
- Machine client issuance, wrong audience/issuer, expiry, rotation and revocation.
- Concurrent approvals and duplicate decision race.
- Unicode/encoded traversal, archive bombs, malformed Office/PDF and malware scanner integration.
- CORS, CSP, CSRF/state, clickjacking and cache-header browser tests.
- Gateway rate limits, request-size/timeouts, load, stress and eight-hour endurance.
- OWASP ZAP DAST in an isolated environment.
- Backup restore and regional/server recovery against four-hour RTO and one-hour RPO.
- Manual penetration-test checklist before production release.

Store results as release evidence linked to the commit SHA, container digest, migration hash and Keycloak realm export hash.
