-- ===========================================================================
-- 005_public_data_release.sql  (Phase 5)
--
-- Supports deliberately published data.
--
-- 004 made tenant isolation strictly own-organisation. That is correct for
-- unpublished research data, but it would also hide data the consortium has
-- chosen to release - so a published test would have been invisible to every
-- partner except its owner, which is not the intent.
--
-- The schema already carries a two-level publication model:
--   * tests.is_public                     - row level: is this test released at all
--   * tests.release_test_details          - field level: which parts are exposed
--     tests.release_raw_data
--     tests.release_processed_data
--     tests.release_final_results
--     tests.release_statistical_analysis
--
-- RLS is row-level, so it enforces the first level only. Field-level masking
-- is an application-layer responsibility - see the note at the end of this
-- file. All 327 production tests are currently fully unreleased (is_public
-- and every release_* flag false), so this migration changes nothing visible
-- until someone deliberately publishes something.
--
-- Idempotent - safe to re-run.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Split the single FOR ALL policy on `tests` into read and write halves.
--
-- READ:  own organisation, OR any row explicitly published.
-- WRITE: own organisation only, always - publication never grants anyone the
--        ability to modify another tenant's row. A tenant therefore cannot
--        reach another tenant's data by flipping flags, because it cannot
--        touch that row at all.
--
-- `is_public` here means PUBLIC ON THE INTERNET - anyone can read it, no
-- authentication required. That is an existing product feature: /tests/public/
-- and the catalogue endpoints intentionally serve anonymous callers. So the
-- read policy must NOT require a tenant context, or anonymous access to
-- released data would break.
--
-- The security invariant this must preserve is narrower, and it holds here:
-- an unscoped connection sees ONLY published rows, never unpublished ones.
-- current_org_id() is NULL without context, so `organisation_id =
-- current_org_id()` is NULL and matches nothing - the only rows that surface
-- are those deliberately marked is_public. That is the intent, not a leak.
--
-- Row visibility is only half the control. Which FIELDS an anonymous caller
-- receives is governed by the release_* flags and enforced in the application
-- (mask_test_for_public in backend/api/services/test.py) - see the note at the
-- end of this file.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON tests;
DROP POLICY IF EXISTS tests_read       ON tests;
DROP POLICY IF EXISTS tests_write      ON tests;

CREATE POLICY tests_read ON tests
    FOR SELECT
    USING (organisation_id = current_org_id() OR is_public = TRUE);

CREATE POLICY tests_write ON tests
    FOR ALL
    USING (organisation_id = current_org_id())
    WITH CHECK (organisation_id = current_org_id());

-- ---------------------------------------------------------------------------
-- Publication is a governed decision, not an ordinary write.
--
-- Releasing research data is effectively irreversible - once published, others
-- may have taken copies. So flipping is_public or any release_* flag requires
-- a governance context (set only when the verified token carries data_owner /
-- api_owner / security_approver / platform_admin), rather than being something
-- any researcher with write access can do unilaterally.
--
-- This is the database-level half of the control; the application still owns
-- recording the approval decision and the audit event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_publication_flags()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.is_public                   IS DISTINCT FROM OLD.is_public
     OR NEW.release_test_details        IS DISTINCT FROM OLD.release_test_details
     OR NEW.release_raw_data            IS DISTINCT FROM OLD.release_raw_data
     OR NEW.release_processed_data      IS DISTINCT FROM OLD.release_processed_data
     OR NEW.release_final_results       IS DISTINCT FROM OLD.release_final_results
     OR NEW.release_statistical_analysis IS DISTINCT FROM OLD.release_statistical_analysis)
       AND NOT is_platform_governance()
    THEN
        RAISE EXCEPTION
          'changing publication/release flags on tests requires a data-owner governance context (test id %)', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_publication ON tests;
CREATE TRIGGER trg_guard_publication
    BEFORE UPDATE ON tests
    FOR EACH ROW EXECUTE FUNCTION guard_publication_flags();

-- Published rows are read cross-tenant, so this predicate is on the hot path.
CREATE INDEX IF NOT EXISTS idx_tests_is_public ON tests (is_public) WHERE is_public;

COMMIT;

-- ===========================================================================
-- FIELD-LEVEL MASKING - implemented in the application, since RLS cannot mask
-- individual columns.
--
-- `mask_test_for_public()` in backend/api/services/test.py is the single place
-- this decision is made. Every read path an unauthenticated caller can reach
-- routes through it, returning each field only if its release flag is set:
--
--     test_details          -> only if release_test_details
--     raw_data              -> only if release_raw_data
--     processed_data        -> only if release_processed_data
--     final_results         -> only if release_final_results
--     statistical_analysis  -> only if release_statistical_analysis
--     file_path             -> ALWAYS withheld (absolute server path)
--
-- The owning organisation always sees all of its own fields.
--
-- This mattered: before it was centralised, only ONE of five read paths applied
-- the release flags. GET /tests/{id}, /tests/name/{name} and
-- /tests/work-package/{name} had no authentication and no is_public filter at
-- all, so every restricted record was readable anonymously in production -
-- confirmed live against database.eurskem.com before the fix. See
-- docs/security/incident-2026-08-unauthenticated-data-exposure.md.
-- ===========================================================================
