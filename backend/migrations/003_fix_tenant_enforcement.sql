-- ===========================================================================
-- 003_fix_tenant_enforcement.sql
--
-- Corrects four defects in 001_secure_foundation.sql that individually make
-- tenant isolation either non-functional or non-enforcing. Written as a
-- separate migration rather than an edit to 001 so the reasoning stays
-- auditable and already-applied databases converge.
--
-- Verified against a real database as a non-superuser role - see
-- backend/tests/sql/test_tenant_isolation.sql, which fails on every one of
-- these defects.
--
-- Idempotent. Run after 001 (and 002 if applied).
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- DEFECT 1 - the policy compared the wrong value, so it matched nothing.
--
-- 001's policy is:
--     organisation_id::text = current_setting('app.current_organisation_id')
-- where organisations.id is a uuid-as-text primary key.
--
-- But the value in the token is the Keycloak Organization ALIAS (a slug such
-- as 'eurskem'), not that UUID - keycloak/build_realm.py configures the
-- membership mapper with addOrganizationId, and a client-credentials token was
-- observed carrying "organisation_id": "eurskem".
--
-- So the comparison was 'a-uuid' = 'eurskem' for every row: no tenant could
-- read its own data, and every tenant-scoped query silently returned zero
-- rows. Silent and total, in the safe direction - but broken.
--
-- Resolved by comparing against the slug via a STABLE lookup function rather
-- than by changing the claim, so the token keeps carrying a stable
-- human-meaningful identifier and the database keeps a surrogate key.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_organisation_id() RETURNS varchar(36)
LANGUAGE sql STABLE AS $$
    SELECT id FROM organisations
     WHERE slug = current_setting('app.current_organisation_id', true)
        OR id   = current_setting('app.current_organisation_id', true)
     LIMIT 1
$$;

COMMENT ON FUNCTION current_organisation_id() IS
'Resolves the tenant from app.current_organisation_id, accepting either the
Keycloak Organization alias (what tokens carry) or the organisations.id
surrogate key. Returns NULL when unset, so policies match no rows - an
unscoped connection is denied rather than granted everything.';

-- organisations itself deliberately has no RLS: it is reference data (the
-- partner list is public), and a policy here would recurse through the
-- function above.

-- ---------------------------------------------------------------------------
-- DEFECT 2 - published data was invisible to everyone.
--
-- 001 contains no reference to is_public at all, so the tests policy was
-- strictly own-organisation. On this platform is_public means PUBLIC ON THE
-- INTERNET: /tests/public/ and the catalogue endpoints serve unauthenticated
-- callers by design. Under 001, deliberately released research became
-- unreadable by other partners AND by anonymous visitors.
--
-- Read and write are therefore split. Write stays strictly own-organisation,
-- so publication never confers the ability to modify another tenant's row -
-- a tenant cannot reach another tenant's data by flipping flags, because it
-- cannot touch that row at all.
--
-- Note what the read policy does NOT require: a tenant context. That is
-- deliberate. current_organisation_id() is NULL without one, so the first
-- clause matches nothing and only is_public rows surface - which is exactly
-- the intent. Field-level exposure within a published row is governed
-- separately by the release_* flags in the application
-- (mask_test_for_public in api/services/test.py).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON tests;
DROP POLICY IF EXISTS tests_read       ON tests;
DROP POLICY IF EXISTS tests_write      ON tests;

CREATE POLICY tests_read ON tests
    FOR SELECT
    USING (organisation_id = current_organisation_id() OR is_public = TRUE);

CREATE POLICY tests_write ON tests
    FOR ALL
    USING (organisation_id = current_organisation_id())
    WITH CHECK (organisation_id = current_organisation_id());

CREATE INDEX IF NOT EXISTS ix_tests_is_public ON tests(is_public) WHERE is_public;

-- ---------------------------------------------------------------------------
-- DEFECT 3 - categories is shared reference data, not tenant data.
--
-- 001 gave categories an organisation_id and a tenant policy. The table holds
-- the consortium-wide taxonomy ('Human Toxicity',
-- 'Physico-Chemical Characteristics', 'Uncategorized'). Scoping it means each
-- organisation needs its own copy, the existing rows belong to no one, and the
-- navigation tree breaks for every partner simultaneously.
--
-- RLS is removed here and the column is left in place but unused - dropping a
-- column is destructive and this is reversible if a future design really does
-- want per-tenant taxonomies. Writes are restricted by grant instead.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON categories;
ALTER TABLE categories NO FORCE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN categories.organisation_id IS
'Unused. categories is shared consortium reference data, not tenant-owned.
Retained rather than dropped so the decision is reversible.';

-- ---------------------------------------------------------------------------
-- Re-point the remaining tenant tables at the corrected resolver.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'protocols', 'protocol_tests', 'organisation_memberships',
        'developer_applications', 'access_requests', 'approval_decisions',
        'active_grants'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format($f$
            CREATE POLICY tenant_isolation ON %I
                FOR ALL
                USING (organisation_id = current_organisation_id())
                WITH CHECK (organisation_id = current_organisation_id())
        $f$, t);
    END LOOP;
END $$;

-- audit_events: readable within your own organisation; insertable for your own
-- organisation or with no organisation attributed (security events can occur
-- before a tenant is known, e.g. a failed token validation). Writing an event
-- attributed to a DIFFERENT organisation is refused, so one tenant cannot
-- forge entries into another's audit history.
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_events;
DROP POLICY IF EXISTS audit_read       ON audit_events;
DROP POLICY IF EXISTS audit_append     ON audit_events;

CREATE POLICY audit_read ON audit_events
    FOR SELECT USING (organisation_id = current_organisation_id());

CREATE POLICY audit_append ON audit_events
    FOR INSERT
    WITH CHECK (organisation_id IS NULL
                OR organisation_id = current_organisation_id());

-- ---------------------------------------------------------------------------
-- DEFECT 4 - the application role was never created, so nothing was enforced.
--
-- 001 wraps its grants in `IF EXISTS (... WHERE rolname = 'chemat_app')`, so on
-- any database where that role does not already exist the whole block is a
-- silent no-op. Combined with the application connecting as `postgres` - a
-- superuser, which bypasses RLS unconditionally - every policy above would
-- have been present, correct-looking, and enforcing absolutely nothing.
--
-- That is the most dangerous of these defects, because `\d` shows the policies
-- and a test written against a superuser connection passes vacuously.
--
-- The role is created here unconditionally. No password is set: it is supplied
-- out of band so no credential enters version control.
--     ALTER ROLE chemat_app WITH PASSWORD '<openssl rand -base64 24>';
-- The backend's DATABASE_URL must then point at chemat_app, NOT postgres.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
        CREATE ROLE chemat_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
                               NOINHERIT NOREPLICATION NOBYPASSRLS;
    ELSE
        ALTER ROLE chemat_app NOSUPERUSER NOCREATEDB NOCREATEROLE
                              NOREPLICATION NOBYPASSRLS;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO chemat_app;
GRANT EXECUTE ON FUNCTION current_organisation_id() TO chemat_app;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'tests', 'protocols', 'protocol_tests', 'organisations',
        'organisation_memberships', 'developer_applications',
        'access_requests', 'approval_decisions', 'active_grants',
        'api_definitions', 'users', 'sessions'
    ]
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO chemat_app', t);
        END IF;
    END LOOP;
END $$;

-- Shared taxonomy: readable by the application, written only via a privileged
-- connection (this is what replaces the RLS removed in defect 3).
GRANT SELECT ON categories TO chemat_app;

-- Append-only, enforced by grant rather than by convention, so tampering fails
-- in the database even if application code is compromised.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM chemat_app;
GRANT SELECT, INSERT ON audit_events TO chemat_app;

DO $$
DECLARE s text;
BEGIN
    FOR s IN SELECT sequence_name FROM information_schema.sequences
              WHERE sequence_schema = 'public'
    LOOP
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO chemat_app', s);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Fail loudly rather than ship a false sense of safety.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
    SELECT rolsuper, rolbypassrls INTO r FROM pg_roles WHERE rolname = 'chemat_app';
    IF r.rolsuper OR r.rolbypassrls THEN
        RAISE EXCEPTION
          'chemat_app must be NOSUPERUSER and NOBYPASSRLS or RLS enforces nothing (rolsuper=%, rolbypassrls=%)',
          r.rolsuper, r.rolbypassrls;
    END IF;
    RAISE NOTICE 'Tenant enforcement corrected. Set a password for chemat_app and point DATABASE_URL at it - connecting as postgres bypasses every policy above.';
END $$;

COMMIT;
