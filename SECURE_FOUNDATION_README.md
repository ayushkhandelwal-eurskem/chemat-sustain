# CheMatSustain secure foundation

This package adds a Keycloak-based, tenant-isolated API foundation without silently rewriting existing research ownership.

Start with `CLAUDE.md` for a token-efficient coding-agent handoff. Human reviewers should read `docs/security/current-state-assessment.md`, `architecture.md`, `database-migration-plan.md` and `release-checklist.md`.

The code is additive and production fail-closed. Existing routes are available only when `ENABLE_LEGACY_API=true`, which production configuration rejects. Secure Phase 1 routes live under `/api/v1`.

Do not deploy until the historical SMTP credential is revoked, legacy data ownership is reviewed, Keycloak is configured, RLS is tested with two tenants, and the release checklist is complete.
