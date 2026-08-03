-- Run as the application role after migration.
BEGIN;
SELECT set_config('app.current_organisation_id', '00000000-0000-0000-0000-000000000001', true);
SELECT count(*) AS visible_tests_for_tenant_one FROM tests;
SELECT set_config('app.current_organisation_id', '00000000-0000-0000-0000-000000000002', true);
SELECT count(*) AS visible_tests_for_tenant_two FROM tests;
ROLLBACK;

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'tests', 'categories', 'protocols', 'protocol_tests',
  'organisation_memberships', 'developer_applications', 'access_requests',
  'approval_decisions', 'active_grants', 'audit_events'
)
ORDER BY relname;
