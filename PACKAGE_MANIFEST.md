# Secure-foundation overlay manifest

Extract this archive at the root of a clean checkout of:

`https://github.com/ayushkhandelwal-eurskem/chemat-sustain`

It intentionally excludes `.git`, `node_modules`, scientific data, uploaded files, images, backups, caches and build output. Those files are unnecessary for Claude Code and waste context.

## Included areas

- Root: environment example, CI/security configuration and operational readmes.
- Backend security: local sessions with email OTP, hashed API-client credentials,
  tenant DB context, safe files and audit chaining.
- Backend domain: organisations, explicit user/resource grants and API clients.
- Secure APIs: scoped Phase 1 research endpoints and API-client verification.
- Database: additive RLS migration, tenant NOT NULL gate and RLS verification SQL.
- Frontend: local session login, password reset, API explorer and dependency security updates.
- Tests and documentation: security unit tests, threat model, control mapping, migration/recovery/incident runbooks and release checklist.

## Recommended Claude Code instruction

> Read `CLAUDE.md` first. Treat all fixed decisions and security rules as mandatory. Do not scan dependencies, data, images, backups or Git history. Run the listed checks, fix only verified failures, and stop at external credential rotation or unresolved data ownership.
