# Incident record: SMTP credential and historical data-dump exposure

Date discovered: 2026-08-02. Status: contained. Repo: `github.com/ayushkhandelwal-eurskem/chemat-sustain` (public).

## What happened

1. **Hard-coded SMTP credential.** `backend/api/services/user.py` contained a live Gmail app password for `database@eurskem.com` in plaintext, used to send login OTP emails. Present in source since commit `50b2d5c`, pushed to the public `origin/main`.
2. **Admin-password logging.** `backend/app.py` printed the bootstrap `ADMIN_PASSWORD` value to stdout/container logs on every application startup.
3. **OTP/session logging.** OTP codes, OTP secrets, and session identifiers were printed to logs in `backend/api/services/user.py` and `backend/api/controllers/user.py`.
4. **Historical data dump.** `cms_backup_2026-06-06.sql` (~11MB) was committed across commits `6116162` → `340706c` and later deleted from the working tree in `b560eb7`, but remained fully recoverable from git history. It contained a `sessions` table (7 real session tokens, user IDs, IPs, user-agents) and a `tests` table (88 real research-test records, 87 marked `is_public=false`, i.e. restricted), embedding real researcher email addresses from partner institutions (`awi.de`, `uniurb.it`, `uni.lodz.pl`, `cnr.it`, `p.lodz.pl`).

## Discovery

Found during the Phase 1 (credential containment) review of this engagement, by direct code inspection and `git log --all` history analysis — not via an external report or automated alert (no such alerting existed prior to this engagement).

## Impact assessment

- The SMTP credential: a working Gmail app password, capable of sending mail as `database@eurskem.com`, exposed to anyone who could read the public repository or its history.
- The session tokens in the SQL dump: verified all 7 had `expires_at` in the past relative to the discovery date (2026-08-02) — not replayable at time of discovery, but were live, valid session credentials at the moment they were committed to a public repo.
- The research-test data: real, largely-restricted (87/88 `is_public=false`) consortium research data, plus personal data (researcher email addresses) of named individuals at partner institutions — a GDPR-relevant personal-data exposure, independent of the credential issue. The user confirmed this had already been reviewed/assessed on their end prior to this engagement surfacing it again.

## Containment actions taken

1. `backend/api/services/user.py`: hard-coded credential replaced with `SMTP_HOST`/`SMTP_PORT`/`SMTP_SENDER_EMAIL`/`SMTP_SENDER_PASSWORD` environment variables.
2. User rotated the credential outside this repository: the old Gmail app password was revoked in Google Account security settings and a new one issued. **The exposure is not considered resolved by code changes alone — rotation was required and is confirmed done.**
3. `backend/app.py`: admin-password logging removed.
4. OTP/session/exception-detail logging removed across `backend/api/services/user.py`, `backend/api/controllers/user.py`, `backend/api/controllers/file_navigator.py`, `backend/api/controllers/test.py`; replaced with structured, redacted logging (`backend/utils/logging_config.py`).
5. Session cookie hardened: `secure` flag now defaults to `true` (was hard-coded `false`), overridable via `SESSION_COOKIE_SECURE` for local HTTP-only dev.
6. `.env.example` added (names/descriptions only).
7. gitleaks secret scanning added to CI (`.github/workflows/security.yml`) and pre-commit (`.pre-commit-config.yaml`).
8. Full repository re-scanned for additional exposed secrets — none found beyond the above.
9. Impact analysis before any history rewrite: repo had exactly one branch (`main`), zero open/closed PRs, zero forks — confirmed via the GitHub API.
10. Git history rewritten with `git-filter-repo` to remove `cms_backup_2026-06-06.sql` from every commit. A full mirror backup was taken before the rewrite; the rewritten history was diffed against the original and confirmed byte-identical except for the removed file. Rewritten history force-pushed to `origin/main`.
11. The SMTP-credential-line history rewrite (i.e. scrubbing the now-rotated password string from old commits' `user.py`) was explicitly deferred by the user to a later pass, since the credential itself is already dead.

## What remediation does *not* undo

Force-pushing a rewritten history removes the data from the *live* repository going forward, but does not retroactively undo any access that already occurred while the data was public — GitHub may retain unreachable objects by direct SHA for a period before garbage collection, and any third party (scraper, search index, prior clone) that already fetched the content independently retains it outside our control. This is noted for the record, not to overstate what was achieved.

## Follow-up / not yet done

- History rewrite for the SMTP credential line itself (deferred by user request).
- Broader review of whether any other automated secret-scanning/breach-notification service should be alerted, beyond what the user has already assessed — outside this engagement's scope to decide.
- Systemic fix: the underlying cause (ad-hoc SQL dumps being taken into the working directory and accidentally `git add`-ed) is addressed going forward by (a) gitleaks now flagging `*.sql`/`*backup*` patterns in CI, and (b) the documented backup procedure (`docs/security/` / `~/chemat-sustain-backups/`, outside the repo) established during this engagement.

## Responsible owner

`platform_admin` (credential rotation, history rewrite), `security_approver` (sign-off on containment completeness).
