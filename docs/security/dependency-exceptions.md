# Dependency vulnerability exceptions

Time-bound, reviewed exceptions to the CI dependency-scan gate (`pip-audit`). Per policy, CI fails the build on any unresolved finding unless it appears here with a justification and a review trigger. Each exception must be re-evaluated at its trigger point, not left indefinitely.

## RESOLVED 2026-08-03 — no starlette exceptions remain

**There are currently no active exceptions for `backend/requirements.txt`.**
`pip-audit -r backend/requirements.txt` reports *"No known vulnerabilities
found"* with **no** `--ignore-vuln` flags, and `.trivyignore` is empty. The
flags and CVE suppressions that implemented the exceptions below have been
removed rather than left in place, because a stale suppression would hide a real
regression if these packages were ever pinned back.

All five findings previously accepted here — `PYSEC-2026-161`, `-248`, `-249`,
`-2280`, `-2281` — are **genuinely fixed** by starlette 1.3.1, alongside 28
other findings across pyjwt, h11, idna, pygments, python-dotenv,
python-multipart and click.

### Why they were accepted longer than necessary

The reasoning recorded below rested on a factual error worth naming, because it
kept five accepted risks open when a fix was available:

> *"a major-version jump that only the latest FastAPI (0.141.1, which drops the
> starlette upper-bound pin entirely) permits"*

FastAPI **0.136.0** declares `starlette>=0.46.0` with **no upper bound**. The
belief that a cap existed came from reading an older release's metadata —
0.129.2 does pin `starlette<1.0.0` — and generalising it. So the "major-version
jump" needed no bleeding-edge FastAPI at all, and the risk it was weighed
against was overstated.

Verified before removing the exceptions: resolves clean, `pip check` clean,
34/34 backend tests pass, and `TestClient` returns identical status codes to the
previous fastapi 0.115.12 / starlette 0.46.1 baseline across `/health`,
`/api/v1/portal/catalog`, `/tests/catalog`, and the `custom_router`
trailing-slash variant `/tests/public/`.

**Lesson for future entries:** an exception justified by "no compatible version
exists" must record the exact constraint checked and the version it was read
from, so it can be re-tested cheaply rather than re-argued.

### Historical record (all resolved — retained for audit)

Bumped 0.46.1 → 0.49.3 on 2026-08-02, closing `PYSEC-2026-1941` and
`PYSEC-2026-1942`; then 0.49.3 → 1.3.1 on 2026-08-03, closing the five below.
The per-finding analysis is kept because the compensating-control reasoning
remains a useful constraint on future code — in particular the rule that
authorisation must never derive from `request.url`.

| ID | Fix requires | Why accepted now |
|---|---|---|
| PYSEC-2026-161 | starlette ≥1.0.1 | Host-header reconstruction can desync `request.url.path` from the actual routed path. Exploitable only for code that makes security decisions based on `request.url`/`request.url.path` rather than the raw ASGI `scope`. Verified during Phase 2 threat modeling that no current route or dependency in this codebase reads `request.url` for authorization — auth is session/cookie-lookup based. **Binding constraint going forward:** Phase 4–7 authorization code (Keycloak claims, tenant scoping, RLS context) must never derive a security decision from `request.url`; only from verified token claims and the raw request. |
| PYSEC-2026-248 | starlette ≥1.3.0 | Same root cause/class as above (path-based authority-boundary confusion), same compensating constraint applies. |
| PYSEC-2026-249 | starlette ≥1.3.1 | `request.form()` size limits (`max_fields`/`max_part_size`) are enforced for `multipart/form-data` but silently ignored for `application/x-www-form-urlencoded`. This app's file-upload paths use `UploadFile`/`File()` (multipart), not raw urlencoded form parsing. Mitigated further by the request-body size limits planned for the API gateway layer in Phase 7, which apply regardless of content type. |
| PYSEC-2026-2280 | starlette ≥1.1.0 | Verb-confusion bug specific to class-based `starlette.endpoints.HTTPEndpoint` subclasses registered via `Route(...)` without an explicit `methods=`. This codebase uses FastAPI's function-based `@router.get/.post/...` decorators exclusively — no `HTTPEndpoint` subclass exists anywhere in `backend/`. Not applicable to this codebase's routing style; re-verify this remains true whenever new routers are added. |
| PYSEC-2026-2281 | starlette ≥1.1.0 | Windows-only SSRF via UNC path handling in `StaticFiles`. This application deploys exclusively on Linux containers (python:3.11-slim-bookworm, IONOS Linux hosting per `docker-compose.yml`). Not exploitable on this deployment target. |

**Review trigger:** re-attempt a full bump to the latest FastAPI/Starlette (dropping the pinned upper bound) once the Phase 9 automated test suite exists and can validate the app end-to-end against it. Track as a Phase 9/10 follow-up item, not indefinitely deferred.

**CI enforcement:** `.github/workflows/security.yml`'s `python-dependency-scan` job passes `--ignore-vuln` for exactly the five IDs above, each with an inline comment pointing back to this file. Any *new* finding not in this table still fails the build.

## Container image scan (Trivy) — same exceptions, different ID scheme

The `container-scan` CI job also flags 2 of the 5 starlette findings above, but Trivy's vulnerability database (NVD/GHSA-sourced) only carries CVE aliases for two of them rather than all five PYSEC IDs:

| PYSEC ID (pip-audit) | CVE ID (Trivy) |
|---|---|
| PYSEC-2026-2281 | CVE-2026-48818 |
| PYSEC-2026-249 | CVE-2026-54283 |

Both are covered by the same reasoning above (Windows-only SSRF; urlencoded-body size limits, mitigated by the planned gateway-level request-size limits) and are listed in `.trivyignore` at the repo root, which `aquasecurity/trivy-action` picks up automatically. PYSEC-2026-161/248/2280 don't have Trivy-indexed CVE aliases as of this writing and so don't appear in the container scan at all - not a contradiction, just different vulnerability-database coverage for the same underlying issues.

## Docker image hardening (applies to both backend and frontend)

While wiring up the container-scan job, both Dockerfiles were restructured to multi-stage builds that strip the base image's own bundled package manager (pip for the backend, npm for the frontend) from the final runtime image entirely, rather than accept their vendored-dependency CVEs (e.g. a stale `msgpack` inside pip's vendor tree, or `tar`/`brace-expansion`/`undici` inside npm's global install) as exceptions. Neither package manager is invoked by the running application, so removing them is a strict improvement, not a workaround: smaller attack surface, smaller image, no exception needed. Verified via live smoke tests (health checks, DB connectivity, static asset serving) after each change - see the Phase 3 PR description for details.
