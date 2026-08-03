-- ===========================================================================
-- 004_enforce_tenancy.sql  (Phase 5)
--
-- BEHAVIOUR-CHANGING. Run only after 003's reconciliation report has been
-- inspected and shows zero remaining NULLs.
--
-- After this migration, a connection that has not set a tenant context sees
-- NO rows in tenant tables. That is deliberate (fail-closed): the alternative
-- failure mode - seeing everything - is a cross-tenant breach.
--
-- Reminder: RLS is bypassed unconditionally by superusers. This only protects
-- anything if the application connects as `chemat_app` (created in 001), NOT
-- as `postgres`. A guard at the end of this file re-checks that role's flags.
--
-- Idempotent - safe to re-run.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Abort rather than corrupt: if the backfill left NULLs, SET NOT NULL would
-- fail mid-migration anyway. Fail early with a clear message instead.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n BIGINT;
BEGIN
    SELECT (SELECT count(*) FROM tests          WHERE organisation_id IS NULL)
         + (SELECT count(*) FROM users          WHERE organisation_id IS NULL)
         + (SELECT count(*) FROM sessions       WHERE organisation_id IS NULL)
         + (SELECT count(*) FROM protocols      WHERE organisation_id IS NULL)
         + (SELECT count(*) FROM protocol_tests WHERE organisation_id IS NULL)
      INTO n;
    IF n > 0 THEN
        RAISE EXCEPTION
          'refusing to enforce tenancy: % row(s) still have a NULL organisation_id. Run 003 and review its reconciliation report first.', n;
    END IF;
END $$;

ALTER TABLE tests          ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE users          ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE sessions       ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE protocols      ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE protocol_tests ALTER COLUMN organisation_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Tenant context resolution.
--
-- The backend sets this per transaction, from the VERIFIED token claim only:
--     SET LOCAL app.current_org = '<organisation_id claim>';
--
-- current_setting(..., true) returns NULL when unset, so the comparison in
-- every policy below yields NULL and no rows match - an unscoped connection
-- sees nothing rather than everything. SET LOCAL keeps it transaction-scoped,
-- so a pooled connection cannot leak context between requests.
--
-- `organisations` deliberately has NO RLS: it is reference data (the partner
-- list is public on chematsustain.eu), and giving it a policy that called this
-- function would recurse.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
    SELECT id FROM organisations
     WHERE slug = current_setting('app.current_org', true)
$$;

-- Governance context. Set ONLY when the verified token carries one of
-- platform_admin / api_owner / data_owner / security_approver. Approvals
-- inherently cross tenants (a coordinator approves a partner's request), so
-- governance tables consult this. The data plane deliberately does NOT - see
-- below.
CREATE OR REPLACE FUNCTION is_platform_governance() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.platform_governance', true), 'off') = 'on'
$$;

GRANT EXECUTE ON FUNCTION current_org_id()        TO chemat_app;
GRANT EXECUTE ON FUNCTION is_platform_governance() TO chemat_app;

-- ---------------------------------------------------------------------------
-- DATA PLANE: strict tenant isolation, with NO governance bypass.
--
-- Even a platform administrator does not read partner research data through
-- the application. This is the least-privilege position and matches the
-- requirement that support staff must not have unrestricted access to
-- customer data. Break-glass access is a deliberate, audited `postgres`
-- connection, not an ambient application capability.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['tests', 'users', 'sessions', 'protocols', 'protocol_tests']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        -- FORCE makes the policy apply to the table owner too, so a future
        -- ownership change cannot silently re-open the bypass.
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
                FOR ALL
                USING (organisation_id = current_org_id())
                WITH CHECK (organisation_id = current_org_id())
        $f$, t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- GOVERNANCE / REGISTRY tables: tenant-isolated, but readable and writable
-- from a verified governance context so the approval workflow can function
-- across tenants.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['keycloak_identities', 'organisation_memberships',
                             'oauth_clients', 'access_requests', 'active_grants',
                             'revocations']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_or_governance ON %I', t);
        EXECUTE format($f$
            CREATE POLICY tenant_or_governance ON %I
                FOR ALL
                USING (organisation_id = current_org_id() OR is_platform_governance())
                WITH CHECK (organisation_id = current_org_id() OR is_platform_governance())
        $f$, t);
    END LOOP;
END $$;

-- approval_decisions has no organisation_id of its own - it derives its tenant
-- from the access request it decides. Only a governance context may write one;
-- a requester's own organisation may read the decisions on its own requests.
ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_decisions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approvals_read  ON approval_decisions;
DROP POLICY IF EXISTS approvals_write ON approval_decisions;

CREATE POLICY approvals_read ON approval_decisions
    FOR SELECT
    USING (
        is_platform_governance()
        OR EXISTS (SELECT 1 FROM access_requests ar
                    WHERE ar.id = approval_decisions.access_request_id
                      AND ar.organisation_id = current_org_id())
    );

CREATE POLICY approvals_write ON approval_decisions
    FOR INSERT
    WITH CHECK (is_platform_governance());

-- ---------------------------------------------------------------------------
-- audit_events: read own organisation only; insert own-organisation or
-- unattributed events.
--
-- NULL organisation_id is permitted on INSERT because some security events
-- occur before a tenant is known (e.g. a failed token validation). Writing an
-- event attributed to a DIFFERENT organisation is blocked, so one tenant
-- cannot forge entries into another's audit history.
--
-- Append-only is enforced by the GRANT in 001 (no UPDATE/DELETE for
-- chemat_app), not by these policies.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_read   ON audit_events;
DROP POLICY IF EXISTS audit_append ON audit_events;

CREATE POLICY audit_read ON audit_events
    FOR SELECT
    USING (organisation_id = current_org_id() OR is_platform_governance());

CREATE POLICY audit_append ON audit_events
    FOR INSERT
    WITH CHECK (organisation_id IS NULL OR organisation_id = current_org_id()
                OR is_platform_governance());

-- ---------------------------------------------------------------------------
-- Final guard: everything above is decorative if the application connects as
-- a superuser. Fail loudly here rather than shipping a false sense of safety.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
    SELECT rolsuper, rolbypassrls INTO r FROM pg_roles WHERE rolname = 'chemat_app';
    IF r IS NULL THEN
        RAISE EXCEPTION 'chemat_app role missing - run 001_tenant_foundation.sql first';
    END IF;
    IF r.rolsuper OR r.rolbypassrls THEN
        RAISE EXCEPTION 'chemat_app must be NOSUPERUSER and NOBYPASSRLS or RLS is ineffective (rolsuper=%, rolbypassrls=%)',
            r.rolsuper, r.rolbypassrls;
    END IF;
    RAISE NOTICE 'RLS enforced. Application must now connect as chemat_app - connecting as postgres bypasses all of the above.';
END $$;

COMMIT;
