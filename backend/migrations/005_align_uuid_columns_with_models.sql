-- Align legacy uuid columns with the current SQLAlchemy models.
--
-- DEV-DATABASE-ONLY REPAIR. Production does NOT need this migration: its
-- schema was built from the reviewed SQL migrations (001/004) and already
-- uses varchar(36) identifiers - verified by the production API credential
-- authenticating and by /v1/* tenant queries returning 200 there.
--
-- This file exists to repair local/legacy databases that were created by an
-- older version of the models via Base.metadata.create_all, which used
-- native PostgreSQL uuid columns for organisation identifiers. Every
-- current model (and every reviewed SQL migration) uses varchar(36) strings:
--
--   * Principal.organisation_id is a Python str, and the Phase 1 endpoints
--     filter with `Test.organisation_id == principal.organisation_id`, which
--     SQLAlchemy binds as VARCHAR. Against a uuid column Postgres raises
--     `operator does not exist: uuid = character varying`, so every
--     tenant-scoped query 500s.
--   * `Base.metadata.create_all` and migrations 001/004 cannot create the
--     api_clients / api_definitions / developer_applications tables, because
--     their varchar(36) foreign keys cannot reference a uuid primary key.
--
-- The fix: convert the 25 legacy uuid columns to varchar(36) (values are
-- unchanged - a uuid casts to the identical canonical text form), rebuild the
-- foreign keys, the current_org_id() helper (whose return type must change
-- from uuid to varchar) and the RLS policies that depend on these columns.
--
-- Run ONCE, on a database still using uuid columns. Everything runs in a
-- single transaction; row counts are small so the table rewrites are cheap.

BEGIN;

-- 1. Drop the RLS policies first: Postgres refuses to alter the type of a
--    column referenced by a policy definition. They are recreated verbatim
--    in step 5 (source: migrations/sql/004_enforce_tenancy.sql and
--    005_public_data_release.sql).
DROP POLICY IF EXISTS tenant_or_governance ON keycloak_identities;
DROP POLICY IF EXISTS tenant_or_governance ON organisation_memberships;
DROP POLICY IF EXISTS tenant_or_governance ON oauth_clients;
DROP POLICY IF EXISTS tenant_or_governance ON access_requests;
DROP POLICY IF EXISTS tenant_or_governance ON active_grants;
DROP POLICY IF EXISTS tenant_or_governance ON revocations;
DROP POLICY IF EXISTS tenant_isolation     ON protocol_tests;
DROP POLICY IF EXISTS tenant_isolation     ON protocols;
DROP POLICY IF EXISTS tenant_isolation     ON sessions;
DROP POLICY IF EXISTS tenant_isolation     ON users;
DROP POLICY IF EXISTS tests_read           ON tests;
DROP POLICY IF EXISTS tests_write          ON tests;
DROP POLICY IF EXISTS approvals_read       ON approval_decisions;
DROP POLICY IF EXISTS approvals_write      ON approval_decisions;
DROP POLICY IF EXISTS audit_read           ON audit_events;
DROP POLICY IF EXISTS audit_append         ON audit_events;

-- 2. Drop foreign keys that span the columns being converted. Integer FKs
--    (sessions_user_id_fkey, protocols_category_id_fkey,
--    protocol_tests_protocol_id_fkey, active_grants_scope_fkey) are untouched.
ALTER TABLE keycloak_identities      DROP CONSTRAINT IF EXISTS keycloak_identities_organisation_id_fkey;
ALTER TABLE organisation_memberships DROP CONSTRAINT IF EXISTS organisation_memberships_organisation_id_fkey;
ALTER TABLE oauth_clients            DROP CONSTRAINT IF EXISTS oauth_clients_organisation_id_fkey;
ALTER TABLE access_requests          DROP CONSTRAINT IF EXISTS access_requests_organisation_id_fkey;
ALTER TABLE access_requests          DROP CONSTRAINT IF EXISTS access_requests_oauth_client_id_fkey;
ALTER TABLE approval_decisions       DROP CONSTRAINT IF EXISTS approval_decisions_access_request_id_fkey;
ALTER TABLE active_grants            DROP CONSTRAINT IF EXISTS active_grants_organisation_id_fkey;
ALTER TABLE active_grants            DROP CONSTRAINT IF EXISTS active_grants_oauth_client_id_fkey;
ALTER TABLE active_grants            DROP CONSTRAINT IF EXISTS active_grants_access_request_id_fkey;
ALTER TABLE revocations              DROP CONSTRAINT IF EXISTS revocations_organisation_id_fkey;
ALTER TABLE audit_events             DROP CONSTRAINT IF EXISTS audit_events_organisation_id_fkey;
ALTER TABLE tests                    DROP CONSTRAINT IF EXISTS tests_organisation_id_fkey;
ALTER TABLE users                    DROP CONSTRAINT IF EXISTS users_organisation_id_fkey;
ALTER TABLE sessions                 DROP CONSTRAINT IF EXISTS sessions_organisation_id_fkey;
ALTER TABLE protocols                DROP CONSTRAINT IF EXISTS protocols_organisation_id_fkey;
ALTER TABLE protocol_tests           DROP CONSTRAINT IF EXISTS protocol_tests_organisation_id_fkey;

-- 3. The helper's declared return type is uuid; it cannot be replaced in
--    place (Postgres forbids changing a function's return type), and the old
--    body selects the column being converted. Drop now, recreate in step 5.
DROP FUNCTION IF EXISTS current_org_id();

-- 4. Convert every legacy uuid column to varchar(36). Values are preserved:
--    uuid::text yields the canonical 36-character form the models expect.
ALTER TABLE organisations            ALTER COLUMN id                TYPE varchar(36) USING id::text;
ALTER TABLE organisation_memberships ALTER COLUMN id                TYPE varchar(36) USING id::text;
ALTER TABLE organisation_memberships ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE keycloak_identities      ALTER COLUMN id                TYPE varchar(36) USING id::text;
ALTER TABLE keycloak_identities      ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE oauth_clients            ALTER COLUMN id                TYPE varchar(36) USING id::text;
ALTER TABLE oauth_clients            ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE access_requests          ALTER COLUMN id                TYPE varchar(36) USING id::text;
ALTER TABLE access_requests          ALTER COLUMN oauth_client_id   TYPE varchar(36) USING oauth_client_id::text;
ALTER TABLE access_requests          ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE active_grants            ALTER COLUMN id                TYPE varchar(36) USING id::text;
ALTER TABLE active_grants            ALTER COLUMN oauth_client_id   TYPE varchar(36) USING oauth_client_id::text;
ALTER TABLE active_grants            ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE active_grants            ALTER COLUMN access_request_id TYPE varchar(36) USING access_request_id::text;
ALTER TABLE approval_decisions       ALTER COLUMN id                TYPE varchar(36) USING id::text;
ALTER TABLE approval_decisions       ALTER COLUMN access_request_id TYPE varchar(36) USING access_request_id::text;
ALTER TABLE audit_events             ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE revocations              ALTER COLUMN id                TYPE varchar(36) USING id::text;
ALTER TABLE revocations              ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE revocations              ALTER COLUMN subject_id        TYPE varchar(36) USING subject_id::text;
ALTER TABLE sessions                 ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE users                    ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE tests                    ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE protocols                ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;
ALTER TABLE protocol_tests           ALTER COLUMN organisation_id   TYPE varchar(36) USING organisation_id::text;


-- 5. Rebuild the helper function (now varchar-typed) and the foreign keys
--    with the same names and definitions as before.

CREATE OR REPLACE FUNCTION current_org_id() RETURNS varchar(36)
LANGUAGE sql STABLE AS $$
    SELECT id FROM organisations
     WHERE slug = current_setting('app.current_org', true)
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
        GRANT EXECUTE ON FUNCTION current_org_id() TO chemat_app;
    END IF;
END $$;

ALTER TABLE keycloak_identities      ADD CONSTRAINT keycloak_identities_organisation_id_fkey       FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE organisation_memberships ADD CONSTRAINT organisation_memberships_organisation_id_fkey  FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE oauth_clients            ADD CONSTRAINT oauth_clients_organisation_id_fkey             FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE access_requests          ADD CONSTRAINT access_requests_organisation_id_fkey           FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE access_requests          ADD CONSTRAINT access_requests_oauth_client_id_fkey           FOREIGN KEY (oauth_client_id)  REFERENCES oauth_clients(id);
ALTER TABLE approval_decisions       ADD CONSTRAINT approval_decisions_access_request_id_fkey      FOREIGN KEY (access_request_id) REFERENCES access_requests(id);
ALTER TABLE active_grants            ADD CONSTRAINT active_grants_organisation_id_fkey             FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE active_grants            ADD CONSTRAINT active_grants_oauth_client_id_fkey             FOREIGN KEY (oauth_client_id)  REFERENCES oauth_clients(id);
ALTER TABLE active_grants            ADD CONSTRAINT active_grants_access_request_id_fkey           FOREIGN KEY (access_request_id) REFERENCES access_requests(id);
ALTER TABLE revocations              ADD CONSTRAINT revocations_organisation_id_fkey               FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE audit_events             ADD CONSTRAINT audit_events_organisation_id_fkey              FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE tests                    ADD CONSTRAINT tests_organisation_id_fkey                     FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE users                    ADD CONSTRAINT users_organisation_id_fkey                     FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE sessions                 ADD CONSTRAINT sessions_organisation_id_fkey                  FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE protocols                ADD CONSTRAINT protocols_organisation_id_fkey                 FOREIGN KEY (organisation_id)  REFERENCES organisations(id);
ALTER TABLE protocol_tests           ADD CONSTRAINT protocol_tests_organisation_id_fkey            FOREIGN KEY (organisation_id)  REFERENCES organisations(id);


-- 6. Recreate the RLS policies verbatim: from migrations/sql/
--    004_enforce_tenancy.sql, plus the tests_read/tests_write pair that
--    005_public_data_release.sql installed.

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users', 'sessions', 'protocols', 'protocol_tests']
    LOOP
        EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL USING (organisation_id = current_org_id()) WITH CHECK (organisation_id = current_org_id())', t);
    END LOOP;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['keycloak_identities', 'organisation_memberships',
                             'oauth_clients', 'access_requests', 'active_grants',
                             'revocations']
    LOOP
        EXECUTE format('CREATE POLICY tenant_or_governance ON %I FOR ALL USING (organisation_id = current_org_id() OR is_platform_governance()) WITH CHECK (organisation_id = current_org_id() OR is_platform_governance())', t);
    END LOOP;
END $$;

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

CREATE POLICY audit_read ON audit_events
    FOR SELECT
    USING (organisation_id = current_org_id() OR is_platform_governance());

CREATE POLICY audit_append ON audit_events
    FOR INSERT
    WITH CHECK (organisation_id IS NULL OR organisation_id = current_org_id()
                OR is_platform_governance());

CREATE POLICY tests_read ON tests
    FOR SELECT
    USING (organisation_id = current_org_id() OR is_public = true);

CREATE POLICY tests_write ON tests
    FOR ALL
    USING (organisation_id = current_org_id())
    WITH CHECK (organisation_id = current_org_id());

COMMIT;

