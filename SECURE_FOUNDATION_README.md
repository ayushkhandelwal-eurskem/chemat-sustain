# CheMatSustain secure foundation

This package provides a local session and API-client security foundation without
silently rewriting existing research ownership.

Start with `CLAUDE.md` for a token-efficient coding-agent handoff. Human reviewers should read `docs/security/current-state-assessment.md`, `architecture.md`, `database-migration-plan.md` and `release-checklist.md`.

Interactive users authenticate with password plus emailed OTP and an HttpOnly,
Secure session cookie. Partner systems use individually issued HTTP Basic client
credentials whose secrets are stored only as bcrypt hashes. Scoped Phase 1
routes live under `/api/v1`.

The historical SMTP credential is revoked. Complete legacy data ownership before
switching the runtime database connection from the current owner role to the
RLS-enforcing `chemat_app` role.
