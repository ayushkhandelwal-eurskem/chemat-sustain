-- Make the user-level all_tests profile flag apply to every current and future
-- test row, including non-public tests owned by another organisation.
--
-- This is deliberately narrower than platform governance: it affects only
-- SELECT on tests. It does not grant test writes, protocols, files, or access
-- to administrative grant tables.

BEGIN;

CREATE OR REPLACE FUNCTION has_all_tests_access() RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.all_tests_access', true), 'off') = 'on'
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
        GRANT EXECUTE ON FUNCTION has_all_tests_access() TO chemat_app;
    END IF;
END $$;

DROP POLICY IF EXISTS tests_read ON tests;
CREATE POLICY tests_read ON tests
    FOR SELECT
    USING (
        is_platform_governance()
        OR has_all_tests_access()
        OR organisation_id = current_access_organisation_id()
        OR is_public = true
        OR EXISTS (
            SELECT 1 FROM organisation_test_access access
            WHERE access.test_id = tests.id
              AND access.organisation_id = current_access_organisation_id()
        )
    );

COMMIT;