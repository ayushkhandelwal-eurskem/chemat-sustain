# Secure-foundation overlay manifest

Extract this archive at the root of a clean checkout of:

`https://github.com/ayushkhandelwal-eurskem/chemat-sustain`

It intentionally excludes `.git`, `node_modules`, scientific data, uploaded files, images, backups, caches and build output. Those files are unnecessary for Claude Code and waste context.

## Included areas

- Root: environment example, secure Compose override, CI/security configuration, `CLAUDE.md`, handoff/readme files.
- Backend security: Keycloak JWT validation, tenant DB context, safe files, audit chain and Keycloak client provisioning.
- Backend domain: organisations, memberships, API definitions, applications, access requests, approvals, grants and audit models.
- Secure APIs: Phase 1 research endpoints and Developer Portal endpoints.
- Database: additive RLS migration, tenant NOT NULL gate and RLS verification SQL.
- Frontend: OIDC/PKCE flow, callback, token attachment, Developer Portal page and dependency security updates.
- Keycloak: secret-free realm import with MFA, roles, scopes, audience and tenant mapper.
- Tests and documentation: security unit tests, threat model, control mapping, migration/recovery/incident runbooks and release checklist.

## Recommended Claude Code instruction

> Read `CLAUDE.md` first. Treat all fixed decisions and security rules as mandatory. Do not scan dependencies, data, images, backups or Git history. Run the listed checks, fix only verified failures, and stop at external credential rotation or unresolved data ownership.
