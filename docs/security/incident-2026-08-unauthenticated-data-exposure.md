# Incident record: unauthenticated exposure of restricted research data

Date discovered: 2026-08-03. Severity: **critical**. Status: fixed in code, **not yet deployed**.

## What was exposed

Three API endpoints served full research test records to **completely unauthenticated** callers, with no `is_public` check and no field masking:

| Endpoint | Auth | `is_public` filter | Field masking |
|---|---|---|---|
| `GET /tests/{test_id}` | none | none | none |
| `GET /tests/name/{test_name}` | none | none | none |
| `GET /tests/work-package/{work_package_name}` | none | none | none |

All **327 production test records** were readable, including every record explicitly marked `is_public = false`. Records are enumerable by sequential integer ID, so the entire dataset was retrievable by iterating `/tests/1`, `/tests/2`, …

## Confirmed live, not theoretical

Verified against production before fixing, using a record whose flags were checked in the database first (`id = 3`, `is_public = false`, all five `release_*` flags `false`):

```
GET https://database.eurskem.com/api/tests/3      -> HTTP 200 (no credentials)
  is_public:            false
  release_* flags:      all false
  test_details:           1,827 bytes   returned
  raw_data:              54,391 bytes   returned
  processed_data:        41,065 bytes   returned
  final_results:          2,711 bytes   returned
```

Only field *sizes* were recorded during verification; no research data was extracted or retained.

## Root cause

`TestService.get_test_by_id` was a bare query with no privacy condition:

```python
stmt = select(Test).filter(Test.id == test_id)   # no is_public, no masking
```

and the controller declared no auth dependency. The same pattern applied to the by-name and by-work-package methods.

The codebase *did* have correct masking logic — but in exactly **one** of five read paths (`get_listings`). `get_catalog` and `get_listings` took a `check_if_private_user` dependency and filtered on `is_public`; the other three took nothing. So the control existed and was simply not applied consistently, which is the more dangerous shape of this bug: reviewing any single correct endpoint gives false confidence.

## Contributing factors

- **`is_public` was assumed to be the only gate.** Because all 327 records were `is_public = false`, the `/tests/public/` endpoint returned nothing and appeared safe. The unguarded by-ID path bypassed that flag entirely.
- **`/tests/public/` had never worked.** `@router.get("/{test_id}")` was declared *before* `@router.get("/public/")`, and FastAPI matches in declaration order, so `/tests/public/` was swallowed by the dynamic single-segment route and failed with an int-parsing error. The endpoint that *did* implement the public/private distinction was dead code.
- **This was found only because the meaning of "public" was corrected.** The initial assumption was that `is_public` meant consortium-internal. Once clarified as *public on the internet*, the anonymous read paths were examined properly and the gap surfaced immediately. Had that assumption gone unchallenged, the fix would have been designed around the wrong threat model.

## Fix

1. **Centralised masking.** `mask_test_for_public()` in `backend/api/services/test.py` is now the single place the release-flag decision is made. Each field is returned only if its `release_*` flag is set, and `file_path` is **always** withheld (it is an absolute server path such as `/app/data/…`, and exposing internal filesystem layout is separately forbidden).
2. **All three endpoints now take `check_if_private_user`** and pass it through to the service.
3. **Fail-closed defaults.** The service methods default `is_private_user=False`, so a future caller that forgets to pass it gets the anonymous treatment — public records only, fields masked — rather than unrestricted access. That default is what turns this class of omission from a breach into a inconvenience.
4. **Non-revealing 404s.** A non-public record returns `404 "Test not found"` to an anonymous caller rather than 403, so existence cannot be probed by ID.
5. **Route ordering fixed**, so `/tests/public/` is reachable.
6. Two adjacent latent bugs fixed while in the code: `get_test_by_name` used `scalar_one_or_none()` on a non-unique column and returned HTTP 500 for any duplicated `test_name` (`SIMS` ×3, `MTT` ×2); and `TestBase.file_path` was declared a required `str` while the column is `nullable=True`, so any record without a stored file failed serialization.

## Verified after fix

Against the running application:

| Case | Result |
|---|---|
| Anonymous `GET /tests/{id}` on a non-public record | `404 Test not found` |
| Anonymous `GET /tests/name/MTT` | `404` (previously `500`) |
| Anonymous `GET /tests/work-package/WP3` | `0` records |
| Anonymous `GET /tests/public/` | `200`, reachable for the first time |
| Anonymous read of a record published with only `release_final_results` | `final_results` returned; `test_details`, `raw_data`, `processed_data`, `statistical_analysis`, `file_path` all withheld |

Database-layer isolation is covered separately by `backend/tests/sql/test_tenant_isolation.sql` (15 assertions, wired into CI), which now asserts the correct semantics: an unscoped connection sees **no unpublished rows**, a published row **is** readable with no tenant context, publishing one row does not expose its neighbours, and publication is blocked outside a data-owner governance context.

## Not yet done

- **The fix is not deployed.** Production is still exposing this data until this branch is merged and deployed. Deployment is currently blocked on the items in `deployment-readiness.md` — notably the git divergence and the `/app/data` volume fix, which must land in the right order.
- No assessment has been made of whether this was exploited. The application does not currently log request-level access to these endpoints, so retrospective determination may not be possible from application logs; nginx access logs on the host may help.
- Whether this constitutes a reportable personal-data breach is a compliance judgement for the platform owner. The exposed records are research data rather than personal data, though `test_details` carries partner attribution and researcher-identifying content in some records.

## Owner

`security_approver` (assessment and any notification decision), `api_owner` (the endpoint fix).
