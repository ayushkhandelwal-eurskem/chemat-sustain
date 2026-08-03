# STRIDE-style threat model

| Threat | Attack path | Prevention | Detection/test | Residual risk / owner |
|---|---|---|---|---|
| Cross-tenant disclosure | Guess another tenant's ID | Token tenant + filters + forced RLS + 404 | Two-tenant API/SQL negative tests | Migration mistakes / data owner |
| Broken object authorization | Direct object ID request | Object query includes token tenant; RLS | BOLA test matrix | New endpoint omission / API owner |
| Privilege escalation | Add role/scope client-side | Signed claims, Keycloak admin controls | Wrong-role/scope tests; realm review | IdP admin compromise / security owner |
| Token theft/replay | Stolen bearer token | TLS, 5-minute tokens, MFA, no token logs/storage persistence | Session and replay exercises | Bearer replay within TTL / security owner |
| Malicious machine client | Excess scopes or secret leak | Three approvals, least scopes, rotation/revocation | Abuse tests, audit alerts | Partner endpoint compromise / API owner |
| Path traversal | `../`, encoding or symlink escape | Canonical tenant-root resolution | Fuzz and symlink tests | Filesystem mis-mount / platform owner |
| Injection | Crafted query/body | ORM binds, schemas, size limits | SAST and input tests | Parser vulnerabilities / API owner |
| XSS/CSRF | Malicious content/browser request | React escaping, OIDC state/PKCE, Bearer API, headers | Browser security tests | Third-party component / frontend owner |
| Credential exposure | Source/log/CI leakage | Environment secrets, redaction, scanning | Gitleaks and log review | Historical SMTP leak / security owner |
| Excessive access | High-rate extraction | Gateway limits, pagination, scopes | Rate/load tests and anomaly alerts | Distributed coordination / platform owner |
| Audit manipulation | Update/delete or chain rewrite | DB grants, append-only table, HMAC chain, export | Chain verification test | DB owner compromise / security owner |
| Admin compromise | Phishing or session theft | Mandatory MFA, short sessions, break-glass process | Admin-login alerts and review | Identity system compromise / security owner |
| Backup disclosure | Stolen snapshot | Encryption, restricted keys, retention | Restore and access review | Key compromise / platform owner |
| Insider misuse | Legitimate but excessive action | Least privilege, approvals, audit, periodic review | Access recertification | Collusion / consortium governance |
