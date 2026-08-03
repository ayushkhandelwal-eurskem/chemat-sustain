# Production Deployment Readiness — IONOS

> ## Deploy log — 2026-08-03
>
> The security work was merged to `main` and deployed. Outcome:
>
> **Achieved:** the unauthenticated data exposure is closed in production (`/api/tests/3` → 404, work-package → 0 records); `/app/data` is now a host bind mount with all 24 research files intact; data verified unchanged (19 users, 327 tests, 3 categories); Keycloak and its database are running; the leaked SQL dump is gone from the server's working tree.
>
> **Two incidents during the deploy, both self-inflicted and both resolved:**
>
> 1. **~4 minute frontend outage (502).** `docker compose up --build` gave the frontend container a new IP, but nginx — which was *not* recreated — had resolved `frontend:3000` at startup six days earlier and kept proxying to the dead address. A `curl` from inside nginx worked (fresh lookup) while nginx's own workers held the stale IP. Fixed by force-recreating nginx.
> 2. **~5 minute API outage (500).** Attempting to fix (1) permanently, I switched the upstreams to variables with a `resolver` so nginx would re-resolve per request. That works for the frontend but broke `/api/`, which combines `rewrite ... break` with `proxy_pass` — nginx returned its own 500. **Reverted to the known-good literal config rather than debugging forward on production.** Service fully restored.
>
> **Consequence — an unresolved operational fragility.** With literal `proxy_pass` hostnames, nginx must be force-recreated after any deploy that recreates the frontend or backend container, or the site 502s:
>
> ```bash
> docker compose up -d --force-recreate nginx
> ```
>
> `/usr/local/bin/deploy` does **not** do this, so every future deploy carries the same 502 risk. Two options, neither yet applied: add that line to the deploy script, or land a properly tested resolver-based config (the `/api/` block needs `proxy_pass $upstream$uri$is_args$args` with the rewrite, verified in dev first — my untested version is what caused incident 2).
>
> **Lesson recorded honestly:** I changed a load-bearing proxy config on production without testing that specific path first. `nginx -t` passed, which validates syntax but not request-path behaviour. The frontend variable worked, so I assumed the backend one would too — the `rewrite` interaction is exactly the kind of thing that needs a real request through it before shipping.


Date: 2026-08-03. Verified against the live production host (`217.154.65.136`, Ubuntu, kernel 7.0.0-22) by direct inspection, not inference.

Goal context: expose Phase 1 research APIs to consortium partners as fast as safely possible. Items below are ordered by what blocks that.

## Production baseline (measured)

| | |
|---|---|
| Host | Ubuntu, 4 cores, 7.7 GB RAM (6.2 GB available), **no swap** |
| Disk | 232 GB total, 35 GB used, 197 GB free |
| Containers | `chematsustain-{frontend,backend,nginx,db}-1`, up 6 days |
| Actual container memory | frontend 230 MB, backend 92 MB, db 80 MB, nginx 14 MB (**~416 MB total**) |
| App database | **19 users, 327 tests, 3 sessions, 3 categories, 0 protocols** |
| `/app/data` (research uploads) | **24 files, 1.9 MB** |
| `/home/chematsustain/protocol_files` | 1 file, 344 KB (host-mounted) |

---

## P0 — Uploaded research files are ephemeral, and 303 records have already lost their source file

**Pre-existing bug, already materialised. Highest priority in this document.**

Test uploads are written to `/app/data` (`backend/api/controllers/test.py:137` → `save_uploaded_file(upload_file, "data", …)`, resolved relative to the container's `/app` cwd), and `backend/api/controllers/file_navigator.py:19` reads from the same place. Verified on the live container: the **only** bind mount is `/home/chematsustain/protocol_files → /app/protocol_files`. There is no volume for `/app/data`, so it lives in the container's writable layer.

Measured impact:

- `tests` rows with a non-empty `file_path`: **327**
- Files actually present in `/app/data`: **24**
- ⇒ **~303 test records (93%) have dangling `file_path` references.** Their source `.xlsx` files were destroyed by previous container rebuilds.

The parsed scientific results survive in Postgres (`raw_data`, `processed_data`, `final_results` JSON columns on `tests`, and `pgdata` is a proper named volume), so the analysed data is intact — it is the original uploads that are gone. Partner-facing file-navigation and download APIs will 404 for those 303 records.

The codebase already knew about this failure mode for the *other* directory — `backend/api/router_protocol_files.py` states *"That directory MUST be a Docker volume mounted from the host … or uploads will live in the ephemeral container layer and disappear on the next deploy."* The same fix was never applied to `/app/data`.

**Fix, in this exact order** (order matters — see the deploy section):

1. ✅ Back up the 24 survivors — **done**, see below.
2. Create the host directory: `mkdir -p /home/chematsustain/research_data`.
3. Restore the 24 files into it from the backup.
4. Add the volume to `docker-compose.yml`:
   ```yaml
   # backend service
   volumes:
     - /home/chematsustain/protocol_files:/app/protocol_files
     - /home/chematsustain/research_data:/app/data      # ADD
   ```
5. Only *then* resolve the git divergence and deploy.
6. Reconcile the 303 dangling `tests.file_path` rows — flag them, do not silently delete.

Not applied in this branch: it requires a host-side directory and file restore that must be coordinated with the deploy, not merged ahead of it.

---

## P0 — Production backup: taken and restore-verified (2026-08-03)

There was **no automated backup of production** before this. Location: `/root/prod-backups/2026-08-03/` on the host — deliberately **outside** `/home/chematsustain`, because backups living inside the git working tree is what caused the original leak.

| Artefact | Contents |
|---|---|
| `app.dump` | 28 MB `pg_dump -F c` of the full application database |
| `app_data/` | The 24 surviving research `.xlsx` files, copied out of the container |
| `protocol_files.tar.gz` | 319 KB, host protocol/SOP files |
| `row_counts.txt`, `app_data_filelist.txt` | Manifest for restore verification |

**Restore-verified:** restored into a throwaway `restore_test` database and row counts compared against the pre-backup manifest — exact match on all five tables (users 19, tests 327, sessions 3, categories 3, protocols 0). Throwaway database dropped afterwards. Permissions: directory `700`, files `600`, root-only.

**This backup contains personal data and credential material** — 19 real users, all 19 with bcrypt password hashes, 1 with an active OTP secret, across 7 email domains including real consortium institutions (`p.lodz.pl`, `chemia.uni.lodz.pl`, `mmu.ac.uk`, `eurskem.com`) and personal addresses. It is GDPR-relevant. Consequently:

- It is currently **unencrypted at rest** on the production host. Encrypting it requires a passphrase, which was deliberately **not** generated inside this transcript — doing so would repeat the original incident. **Open decision for the platform owner: choose an encryption method and an off-host destination.**
- A single-host backup does not survive host loss. It has deliberately **not** been copied to a developer laptop, since that would move 19 people's personal data and password hashes onto an endpoint — an owner decision, not an implementation detail.

### Legacy artefacts — remediated

Five leftover manual backups were found sitting **untracked inside the git working tree** on production, none matched by the server's `.gitignore` (whose only pattern, `cms_backup_2026-06-06.sql*.sql`, is the broken one that never matched anything). All three `users_*.sql` files contain user rows. One `git add -A && git push` would have re-leaked them publicly.

Moved to `/root/prod-backups/legacy-artifacts/` (chmod 600), out of the working tree: `images_backup.tar.gz` (126 MB), `tests_data.sql` (213 MB), `users_data.sql`, `users_from_backup.sql`, `users_live_backup.sql`. Nothing deleted. `protocol_files/` was deliberately left in place — it is the live bind-mount source the container serves from; verified intact afterwards (1 file host-side and in-container) with the app healthy (HTTP 200).

`cms_backup_2026-06-06.sql` remains in the tree as it is *tracked* in the server's (old, divergent) history — handle it while resolving the divergence.

`.gitignore` was strengthened to close the gaps that allowed this: `*_data.sql`, `*_live*.sql`, `*backup*.tar.gz`, `*.dump`, `prod-backups/`, `backups/` are now covered, verified with `git check-ignore` while confirming legitimate seed/schema scripts (`seed_categories.sql`, `backend/setup_tree.sql`) remain tracked.

---

## P0 — Production deploys are currently broken, and fixing them will destroy data unless sequenced

`/usr/local/bin/deploy` (not in version control; retrieved from the host):

```bash
#!/bin/bash
set -e
cd /home/chematsustain
git pull origin main
docker compose up --build -d
docker compose ps
```

Two consequences:

1. **`git pull origin main` fails.** The server's clone is `ahead 25, behind 25` of `origin/main` — history diverged when `main` was force-pushed to purge the leaked SQL dump. With `set -e`, the script aborts there. **Production has not deployed successfully since that force-push.**
2. **That failure is currently protecting the data.** Because the script aborts before `docker compose up --build`, the backend container is never rebuilt, so the 24 surviving `/app/data` files persist. The moment the git divergence is resolved, the next deploy rebuilds the backend and **wipes them** — unless the P0 volume fix has landed first.

**Therefore: add the `/app/data` volume before resolving the git divergence.** Resolving the divergence on the server will need an explicit reset to the rewritten history (e.g. `git fetch origin && git reset --hard origin/main`) rather than a merge — which discards the server's divergent commits, so confirm nothing of value exists only there first.

## P0 — Rotate the root password

The production root password was pasted into a chat transcript during this session. It should be rotated. Separately, root SSH with password authentication is itself a weakness for a host holding consortium personal data — key-only authentication for a non-root account with `sudo`, plus `PermitRootLogin no`, would be the stronger posture. Related: `fail2ban` status was not checked.

## P0 — Missing `.env` variables will break the next successful deploy

`docker-compose.yml` now references five variables absent from the server's `.env`. With `POSTGRES_PASSWORD` empty the Postgres image aborts, failing the deploy:

| Variable | Note |
|---|---|
| `KEYCLOAK_DB_USER` | e.g. `keycloak` |
| `KEYCLOAK_DB_PASSWORD` | **generate fresh** (`openssl rand -base64 24`) — do not reuse dev values |
| `KEYCLOAK_DB_NAME` | e.g. `keycloak` |
| `KEYCLOAK_ADMIN_USERNAME` | Keycloak bootstrap admin |
| `KEYCLOAK_ADMIN_PASSWORD` | **generate fresh**, long/random — identity-system superuser |

Plus, once OIDC is enforced (Phase 6/7): `KEYCLOAK_ISSUER_URL=https://auth.eurskem.com/realms/chematsustain` and `KEYCLOAK_BACKEND_AUDIENCE=chematsustain-api`. See `.env.example`.

---

## Resolved — no longer blockers

- **Memory.** 7.7 GB RAM with only ~416 MB actually in use by the current stack. Adding Keycloak (~500 MB–1 GB) plus its Postgres (~100 MB) fits comfortably. The 6.0 GB of declared *limits* are ceilings, not reservations. Caveat: **no swap**, so an OOM kills rather than degrades — keep the limits in place.
- **TLS for `auth.eurskem.com`.** `/etc/ssl/certs/origin.pem` is a Cloudflare Origin CA certificate with SANs `*.eurskem.com, eurskem.com`, valid to 2041 — the auth subdomain is already covered. No new certificate needed. Verified locally that Keycloak with `KC_HOSTNAME: https://auth.eurskem.com` and `KC_PROXY_HEADERS: xforwarded` advertises `https://auth.eurskem.com/...` in its OIDC discovery document.
- **Keycloak production image.** `start --optimized` initially failed (`"The '--optimized' flag was used for first ever server start"`) because build-time options such as `KC_DB` cannot be supplied as runtime environment variables. Fixed with `keycloak/Dockerfile`, which bakes them via `kc.sh build`; verified starting in 4 s with `Profile prod activated` and a working `/health/ready`.

## Still open (needs owner action)

1. **DNS:** an A record for `auth.eurskem.com` → `217.154.65.136`, and a decision on Cloudflare proxying. Not accessible from this environment.
2. **Backup encryption + off-host destination** (see P0 backup section).
3. **Root password rotation** and SSH hardening.

## Authentication cutover sequencing (partner-visible)

Production authenticates via the homegrown session-cookie system today. Phase 4 is **additive** — two new `/oidc/*` endpoints, no existing route changed — so it is safe to merge. Phases 6–7 move real endpoints onto OIDC enforcement, which is a hard cutover. Required order:

1. `/app/data` volume fix deployed (P0 above).
2. Keycloak live at `auth.eurskem.com` (DNS done; TLS already covered).
3. The 19 existing users provisioned in the realm and mapped to their organisations **before** enforcement — otherwise they are locked out.
4. Frontend migrated to Authorization Code + PKCE.
5. Backend endpoints switched to OIDC enforcement, ideally behind a feature flag so it reverts without a redeploy.
6. Retire the session-cookie path and the `users`/`sessions` tables only once the above is confirmed.

## Accepted risks (decisions on record)

- **RPO amended 1 hour → 15 days.** 15-day full backups only, no WAL archiving or incremental layer. The tiered alternative meeting a 1-hour RPO, and a nightly middle ground, were both presented and declined in favour of operational simplicity. RTO remains 4 hours; availability target 99.9%.
- **Protocol PDFs remain in git history.** Purging was considered and declined; treat that document as publicly disclosed.
- **Five starlette CVEs deferred** — per-CVE justification and review trigger in `docs/security/dependency-exceptions.md`.

## Realism note on the service targets

99.9% availability allows ~43 minutes of downtime per month. This is a single IONOS VM running docker-compose with no redundancy, no failover, no swap, and a manual restore path against a 4-hour RTO. One kernel-update reboot can consume most of a month's budget. Combined with the 15-day RPO, a host or disk failure means up to 15 days of consortium data lost. Meeting 99.9% properly needs a second instance and automated failover. Recorded so the gap between target and architecture is explicit rather than assumed away.

## Follow-ups (not blocking partner access)

- Bring `/usr/local/bin/deploy` into version control — it is currently unreviewable infrastructure.
- The deploy workflow has no gate: it deploys on push to `main` with no dependency on the Phase 3 security workflow, which runs in parallel. Making deployment depend on it would stop a build shipping with a failing security gate. (`deploy.yml` untouched per the original instruction.)
- No image signing/provenance, no canary or blue-green, no automated rollback.
- Keycloak patch cadence — it becomes the authentication trust root; see threat model §13.
- `fail2ban` / SSH brute-force protection status unverified.
