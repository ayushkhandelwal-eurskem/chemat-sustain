-- ===========================================================================
-- Cross-tenant isolation tests.
--
-- MUST run as chemat_app (non-superuser). As a superuser every assertion below
-- passes vacuously, because superusers bypass RLS unconditionally - that false
-- assurance is exactly what this file exists to prevent, so T0 checks it first
-- and fails hard.
--
--   PGPASSWORD=... psql -h <host> -U chemat_app -d <db> \
--     -v ON_ERROR_STOP=1 -f test_tenant_isolation.sql
--
-- Each assertion maps to a defect genuinely present in 001_secure_foundation.sql
-- and corrected in 003_fix_tenant_enforcement.sql:
--   T0    <- the app role was never created, so no policy enforced anything
--   T1/T3 <- the policy compared organisations.id to the token's slug, matching
--            nothing, so every tenant silently saw zero rows
--   T7    <- is_public was absent, so published data was invisible to everyone
--   T9    <- categories was tenant-scoped despite being shared reference data
--
-- Any failure RAISEs, so psql exits non-zero and CI fails the build.
-- ===========================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
    org_a    varchar(36);
    org_b    varchar(36);
    slug_a   text := 'ulodz';
    slug_b   text := 'tul';
    n        bigint;
    r        record;
    failures int := 0;
BEGIN
    -- T0: the enforcement mechanism itself.
    SELECT rolsuper, rolbypassrls INTO r FROM pg_roles WHERE rolname = current_user;
    IF r.rolsuper OR r.rolbypassrls THEN
        RAISE EXCEPTION
          'T0 FAIL: connected as % which BYPASSES RLS (rolsuper=%, rolbypassrls=%). Every assertion below would pass without proving anything.',
          current_user, r.rolsuper, r.rolbypassrls;
    END IF;
    RAISE NOTICE 'T0 PASS: % cannot bypass RLS', current_user;

    SELECT id INTO org_a FROM organisations WHERE slug = slug_a;
    SELECT id INTO org_b FROM organisations WHERE slug = slug_b;
    IF org_a IS NULL OR org_b IS NULL THEN
        RAISE EXCEPTION 'fixture organisations (%, %) are missing', slug_a, slug_b;
    END IF;

    -- T1: the resolver accepts the alias tokens actually carry. If this fails,
    -- claim and column are different values and nothing matches - the failure
    -- mode is total invisibility, easily mistaken for "no data yet".
    PERFORM set_config('app.current_organisation_id', slug_a, true);
    IF current_organisation_id() IS DISTINCT FROM org_a THEN
        RAISE WARNING 'T1 FAIL: alias % did not resolve to an organisation id', slug_a;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T1 PASS: token alias resolves to an organisation id';
    END IF;

    -- T2: no tenant context => no unpublished rows. Published rows are
    -- deliberately world-readable, so scope this to unpublished data.
    PERFORM set_config('app.current_organisation_id', '', true);
    SELECT count(*) INTO n FROM tests WHERE NOT is_public;
    IF n <> 0 THEN
        RAISE WARNING 'T2 FAIL: % unpublished row(s) visible with no tenant context', n;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T2 PASS: no context => no unpublished rows';
    END IF;

    -- T3: a tenant CAN read its own rows. The positive case matters as much as
    -- the negative ones: a policy that denies everything is not isolation.
    PERFORM set_config('app.current_organisation_id', slug_a, true);
    SELECT count(*) INTO n FROM tests WHERE organisation_id = org_a;
    IF n = 0 THEN
        RAISE WARNING 'T3 FAIL: tenant % cannot see any of its own rows', slug_a;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T3 PASS: tenant sees its own rows (%)', n;
    END IF;

    -- T4: and none of another tenant's unpublished rows.
    SELECT count(*) INTO n FROM tests WHERE organisation_id = org_b AND NOT is_public;
    IF n <> 0 THEN
        RAISE WARNING 'T4 FAIL: % sees % unpublished row(s) belonging to %', slug_a, n, slug_b;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T4 PASS: cross-tenant read blocked';
    END IF;

    -- T5: cross-tenant UPDATE affects nothing.
    PERFORM set_config('app.current_organisation_id', slug_b, true);
    WITH upd AS (
        UPDATE tests SET test_name = test_name WHERE organisation_id = org_a RETURNING 1
    ) SELECT count(*) INTO n FROM upd;
    IF n <> 0 THEN
        RAISE WARNING 'T5 FAIL: % updated % row(s) belonging to %', slug_b, n, slug_a;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T5 PASS: cross-tenant UPDATE affected 0 rows';
    END IF;

    -- T6: cross-tenant INSERT is refused by WITH CHECK.
    BEGIN
        INSERT INTO tests (work_package_name, test_name, organisation_id, created_at, updated_at)
        VALUES ('WP-ISO-TEST', 'cross-tenant-probe', org_a, now(), now());
        RAISE WARNING 'T6 FAIL: cross-tenant INSERT was ALLOWED';
        failures := failures + 1;
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        RAISE NOTICE 'T6 PASS: cross-tenant INSERT refused';
    END;

    -- T7: publication works. is_public means public on the internet, so a
    -- published row must be readable with NO tenant context at all.
    PERFORM set_config('app.current_organisation_id', slug_a, true);
    UPDATE tests SET is_public = TRUE
     WHERE id = (SELECT min(id) FROM tests WHERE organisation_id = org_a);

    PERFORM set_config('app.current_organisation_id', '', true);
    SELECT count(*) INTO n FROM tests WHERE is_public;
    IF n < 1 THEN
        RAISE WARNING 'T7 FAIL: published row NOT readable without a tenant context - anonymous public access is broken';
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T7 PASS: published row readable with no tenant context';
    END IF;

    -- T8: publishing one row must not drag its neighbours along.
    SELECT count(*) INTO n FROM tests WHERE NOT is_public;
    IF n <> 0 THEN
        RAISE WARNING 'T8 FAIL: publishing one row exposed % unpublished row(s)', n;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T8 PASS: publishing one row did not expose others';
    END IF;

    PERFORM set_config('app.current_organisation_id', slug_a, true);
    UPDATE tests SET is_public = FALSE WHERE is_public;

    -- T9: categories is shared reference data. Every tenant must see the whole
    -- taxonomy; scoping it breaks the navigation tree for everyone at once.
    PERFORM set_config('app.current_organisation_id', slug_b, true);
    SELECT count(*) INTO n FROM categories;
    IF n = 0 THEN
        RAISE WARNING 'T9 FAIL: shared categories taxonomy invisible to % - wrongly tenant-scoped?', slug_b;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T9 PASS: shared taxonomy visible (% rows)', n;
    END IF;

    -- T10/T11: audit is append-only by GRANT, not convention, so tampering
    -- fails in the database even if application code is compromised.
    BEGIN
        UPDATE audit_events SET outcome = 'tampered' WHERE true;
        RAISE WARNING 'T10 FAIL: UPDATE on audit_events was ALLOWED';
        failures := failures + 1;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'T10 PASS: UPDATE on audit_events denied';
    END;

    BEGIN
        DELETE FROM audit_events WHERE true;
        RAISE WARNING 'T11 FAIL: DELETE on audit_events was ALLOWED';
        failures := failures + 1;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'T11 PASS: DELETE on audit_events denied';
    END;

    IF failures > 0 THEN
        RAISE EXCEPTION 'TENANT ISOLATION TESTS FAILED: % assertion(s)', failures;
    END IF;
    RAISE NOTICE 'ALL TENANT ISOLATION TESTS PASSED';
END $$;
