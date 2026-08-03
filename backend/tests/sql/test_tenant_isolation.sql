-- ===========================================================================
-- Cross-tenant isolation tests. MUST be run as the non-superuser application
-- role (chemat_app) - as a superuser every assertion below passes vacuously
-- because superusers bypass RLS entirely, which is exactly the false-assurance
-- trap this file exists to prevent.
--
--   PGPASSWORD=... psql -h <host> -U chemat_app -d <db> \
--     -v ON_ERROR_STOP=1 -f test_tenant_isolation.sql
--
-- Any failure RAISEs, so psql exits non-zero and CI fails the build.
-- Creates and removes its own fixtures; leaves no residue except audit rows,
-- which are append-only by design.
-- ===========================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
    org_a UUID;
    org_b UUID;
    n     BIGINT;
    r     RECORD;
    failures INT := 0;
BEGIN
    -- -------------------------------------------------------------------
    -- T0: the mechanism itself. If the connected role bypasses RLS, every
    -- other test is meaningless - fail immediately and loudly.
    -- -------------------------------------------------------------------
    SELECT rolsuper, rolbypassrls INTO r FROM pg_roles WHERE rolname = current_user;
    IF r.rolsuper OR r.rolbypassrls THEN
        RAISE EXCEPTION
          'T0 FAIL: connected as % which bypasses RLS (rolsuper=%, rolbypassrls=%). These tests only mean something as a non-superuser role.',
          current_user, r.rolsuper, r.rolbypassrls;
    END IF;
    RAISE NOTICE 'T0 PASS: % does not bypass RLS', current_user;

    SELECT id INTO org_a FROM organisations WHERE slug = 'ulodz';
    SELECT id INTO org_b FROM organisations WHERE slug = 'tul';
    IF org_a IS NULL OR org_b IS NULL THEN
        RAISE EXCEPTION 'fixture orgs missing - run 001_tenant_foundation.sql';
    END IF;

    -- -------------------------------------------------------------------
    -- T1: no tenant context => no rows. Fail-closed, not fail-open.
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', '', true);
    SELECT count(*) INTO n FROM tests;
    IF n <> 0 THEN
        RAISE WARNING 'T1 FAIL: % rows visible with no tenant context (expected 0)', n;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T1 PASS: no context => 0 rows';
    END IF;

    -- -------------------------------------------------------------------
    -- T2: a bogus tenant slug also yields nothing.
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', 'no-such-org', true);
    SELECT count(*) INTO n FROM tests;
    IF n <> 0 THEN
        RAISE WARNING 'T2 FAIL: % rows visible for unknown tenant slug', n;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T2 PASS: unknown slug => 0 rows';
    END IF;

    -- -------------------------------------------------------------------
    -- T3: tenant A never sees tenant B's rows.
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', 'ulodz', true);
    SELECT count(*) INTO n FROM tests WHERE organisation_id = org_b;
    IF n <> 0 THEN
        RAISE WARNING 'T3 FAIL: ulodz context sees % of tul''s rows', n;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T3 PASS: ulodz cannot see tul rows';
    END IF;

    -- -------------------------------------------------------------------
    -- T4: cross-tenant UPDATE silently affects nothing (policy filters the
    -- rows out rather than erroring).
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', 'tul', true);
    WITH upd AS (
        UPDATE tests SET test_name = test_name WHERE organisation_id = org_a RETURNING 1
    ) SELECT count(*) INTO n FROM upd;
    IF n <> 0 THEN
        RAISE WARNING 'T4 FAIL: tul context updated % of ulodz''s rows', n;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T4 PASS: cross-tenant UPDATE affected 0 rows';
    END IF;

    -- -------------------------------------------------------------------
    -- T5: cross-tenant INSERT is actively rejected by WITH CHECK.
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', 'tul', true);
    BEGIN
        INSERT INTO tests (work_package_name, test_name, organisation_id, created_at, updated_at)
        VALUES ('WP-RLS-TEST', 'cross-tenant-probe', org_a, now(), now());
        RAISE WARNING 'T5 FAIL: cross-tenant INSERT was ALLOWED';
        failures := failures + 1;
        DELETE FROM tests WHERE test_name = 'cross-tenant-probe';
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        RAISE NOTICE 'T5 PASS: cross-tenant INSERT rejected';
    END;

    -- -------------------------------------------------------------------
    -- T6: same-tenant INSERT still works - isolation must not break the
    -- legitimate path.
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', 'tul', true);
    BEGIN
        INSERT INTO tests (work_package_name, test_name, organisation_id, created_at, updated_at)
        VALUES ('WP-RLS-TEST', 'same-tenant-probe', org_b, now(), now());
        DELETE FROM tests WHERE test_name = 'same-tenant-probe';
        RAISE NOTICE 'T6 PASS: same-tenant INSERT allowed';
    EXCEPTION WHEN others THEN
        RAISE WARNING 'T6 FAIL: same-tenant INSERT rejected: %', SQLERRM;
        failures := failures + 1;
    END;

    -- -------------------------------------------------------------------
    -- T6b: published rows are readable cross-tenant, but ONLY with a valid
    -- tenant context - a published row must never be visible to an unscoped
    -- connection. Guards the regression fixed in 005.
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', '', true);
    SELECT count(*) INTO n FROM tests WHERE is_public;
    IF n <> 0 THEN
        RAISE WARNING 'T6b FAIL: % published row(s) visible with NO tenant context', n;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T6b PASS: published rows hidden from unscoped connections';
    END IF;

    -- -------------------------------------------------------------------
    -- T7: audit_events is append-only at the GRANT level, so tampering
    -- fails even if application code is compromised.
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', 'tul', true);
    INSERT INTO audit_events (action, result, organisation_id)
    VALUES ('rls.selftest', 'success', org_b);

    BEGIN
        UPDATE audit_events SET action = 'tampered' WHERE action = 'rls.selftest';
        RAISE WARNING 'T7 FAIL: UPDATE on audit_events was ALLOWED';
        failures := failures + 1;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'T7 PASS: UPDATE on audit_events denied';
    END;

    BEGIN
        DELETE FROM audit_events WHERE action = 'rls.selftest';
        RAISE WARNING 'T8 FAIL: DELETE on audit_events was ALLOWED';
        failures := failures + 1;
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'T8 PASS: DELETE on audit_events denied';
    END;

    -- -------------------------------------------------------------------
    -- T9: one tenant cannot forge an audit entry attributed to another.
    -- -------------------------------------------------------------------
    PERFORM set_config('app.current_org', 'tul', true);
    BEGIN
        INSERT INTO audit_events (action, result, organisation_id)
        VALUES ('rls.forge', 'success', org_a);
        RAISE WARNING 'T9 FAIL: tul forged an audit event attributed to ulodz';
        failures := failures + 1;
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        RAISE NOTICE 'T9 PASS: cross-tenant audit forgery rejected';
    END;

    -- -------------------------------------------------------------------
    -- T10: the audit hash chain is intact (tamper evidence).
    -- -------------------------------------------------------------------
    SELECT count(*) INTO n FROM (
        SELECT id, prev_hash,
               lag(entry_hash) OVER (ORDER BY id) AS expected_prev
        FROM audit_events
    ) c WHERE id > (SELECT min(id) FROM audit_events)
        AND coalesce(prev_hash, '') <> coalesce(expected_prev, '');
    IF n <> 0 THEN
        RAISE WARNING 'T10 FAIL: audit hash chain broken at % row(s)', n;
        failures := failures + 1;
    ELSE
        RAISE NOTICE 'T10 PASS: audit hash chain intact';
    END IF;

    IF failures > 0 THEN
        RAISE EXCEPTION 'TENANT ISOLATION TESTS FAILED: % assertion(s)', failures;
    END IF;
    RAISE NOTICE 'ALL TENANT ISOLATION TESTS PASSED';
END $$;
