-- Post-migration RLS posture check.
--
-- MUST be run as the runtime application role (chemat_app), never as postgres.
--
-- The header said "run as the application role" but nothing enforced it, and
-- running it as postgres produces output that looks like a clean report while
-- proving nothing: superusers and roles with BYPASSRLS ignore every policy, so
-- both tenant counts come back as the full table. Observed on 2026-08-03 -
-- 5 and 5 as postgres, against a fixture where the correct answers were 3 and 2.
--
-- A verification script that can silently emit a false all-clear is worse than
-- no script, so this now refuses to run rather than mislead.
DO $$
DECLARE
    is_super boolean;
    can_bypass boolean;
BEGIN
    SELECT rolsuper, rolbypassrls INTO is_super, can_bypass
      FROM pg_roles WHERE rolname = current_user;

    IF is_super OR can_bypass THEN
        RAISE EXCEPTION
            'REFUSING TO RUN: connected as % (rolsuper=%, rolbypassrls=%), which bypasses RLS. '
            'Every count below would report the whole table and the report would be meaningless. '
            'Reconnect as the runtime application role, e.g. psql -U chemat_app.',
            current_user, is_super, can_bypass;
    END IF;

    RAISE NOTICE 'Connected as % - subject to RLS, results are meaningful.', current_user;
END $$;

-- Per-tenant visibility. Accepts either an organisation slug or its id: the
-- session variable is resolved through current_organisation_id().
BEGIN;
SELECT set_config('app.current_organisation_id', '00000000-0000-0000-0000-000000000001', true);
SELECT count(*) AS visible_tests_for_tenant_one FROM tests;
SELECT set_config('app.current_organisation_id', '00000000-0000-0000-0000-000000000002', true);
SELECT count(*) AS visible_tests_for_tenant_two FROM tests;
ROLLBACK;

-- With no tenant context at all, only rows explicitly published to the public
-- internet may be visible. A non-zero count here that exceeds the number of
-- released rows means the read policy is too broad.
BEGIN;
SELECT count(*) AS visible_with_no_tenant_context FROM tests;
ROLLBACK;

-- relrowsecurity must be true, and relforcerowsecurity must ALSO be true:
-- without FORCE, the table owner is exempt from its own policies.
-- categories is the one deliberate exception - it holds the shared consortium
-- taxonomy, which belongs to no single organisation and is restricted by GRANT
-- instead. See 003_fix_tenant_enforcement.sql.
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'tests', 'categories', 'protocols', 'protocol_tests',
  'organisation_memberships', 'developer_applications', 'access_requests',
  'approval_decisions', 'active_grants', 'audit_events'
)
ORDER BY relname;
