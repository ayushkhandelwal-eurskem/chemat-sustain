-- CheMatSustain secure foundation (PostgreSQL 14+)
-- Apply with a migration role that owns the affected tables.
-- Existing tenant-owned rows intentionally remain NULL/quarantined until the
-- reviewed backfill in docs/database-migration-plan.md is completed.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organisations (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    slug varchar(80) NOT NULL UNIQUE,
    name varchar(200) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organisation_memberships (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organisation_id varchar(36) NOT NULL REFERENCES organisations(id),
    keycloak_subject varchar(120) NOT NULL,
    email varchar(320),
    roles jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    UNIQUE (organisation_id, keycloak_subject)
);

CREATE TABLE IF NOT EXISTS api_definitions (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name varchar(120) NOT NULL UNIQUE,
    version varchar(40) NOT NULL,
    description text NOT NULL,
    classification varchar(40) NOT NULL DEFAULT 'consortium',
    scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS developer_applications (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organisation_id varchar(36) NOT NULL REFERENCES organisations(id),
    name varchar(120) NOT NULL,
    description text NOT NULL DEFAULT '',
    owner_subject varchar(120) NOT NULL,
    keycloak_client_id varchar(160) UNIQUE,
    credential_version integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, name)
);

DO $$ BEGIN
  CREATE TYPE requeststatus AS ENUM ('pending', 'approved', 'rejected', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approvalrole AS ENUM ('api_owner', 'data_owner', 'security_approver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS access_requests (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organisation_id varchar(36) NOT NULL REFERENCES organisations(id),
    application_id varchar(36) NOT NULL REFERENCES developer_applications(id),
    requested_scopes jsonb NOT NULL,
    justification text NOT NULL,
    requested_by varchar(120) NOT NULL,
    status requeststatus NOT NULL DEFAULT 'pending',
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_decisions (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organisation_id varchar(36) NOT NULL REFERENCES organisations(id),
    access_request_id varchar(36) NOT NULL REFERENCES access_requests(id),
    approval_role approvalrole NOT NULL,
    decision varchar(20) NOT NULL CHECK (decision IN ('approved', 'rejected')),
    reason text NOT NULL,
    actor_subject varchar(120) NOT NULL,
    decided_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (access_request_id, approval_role)
);

CREATE TABLE IF NOT EXISTS active_grants (
    id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    organisation_id varchar(36) NOT NULL REFERENCES organisations(id),
    access_request_id varchar(36) NOT NULL UNIQUE REFERENCES access_requests(id),
    application_id varchar(36) NOT NULL REFERENCES developer_applications(id),
    scopes jsonb NOT NULL,
    issued_by varchar(120) NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    revoked_by varchar(120),
    revocation_reason text
);

CREATE TABLE IF NOT EXISTS audit_events (
    event_id varchar(36) PRIMARY KEY,
    organisation_id varchar(36) NOT NULL REFERENCES organisations(id),
    sequence integer NOT NULL,
    actor_subject varchar(120) NOT NULL,
    actor_client_id varchar(160),
    action varchar(120) NOT NULL,
    resource_type varchar(80) NOT NULL,
    resource_id varchar(160),
    outcome varchar(30) NOT NULL,
    occurred_at timestamptz NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    previous_hash varchar(64) NOT NULL,
    event_hash varchar(64) NOT NULL,
    UNIQUE (organisation_id, sequence)
);

-- Additive nullable columns quarantine existing data instead of assigning an
-- organisation silently. Make them NOT NULL only after reviewed backfill.
ALTER TABLE tests ADD COLUMN IF NOT EXISTS organisation_id varchar(36) REFERENCES organisations(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS organisation_id varchar(36) REFERENCES organisations(id);
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS organisation_id varchar(36) REFERENCES organisations(id);
ALTER TABLE protocol_tests ADD COLUMN IF NOT EXISTS organisation_id varchar(36) REFERENCES organisations(id);

CREATE INDEX IF NOT EXISTS ix_tests_organisation_id ON tests(organisation_id);
CREATE INDEX IF NOT EXISTS ix_categories_organisation_id ON categories(organisation_id);
CREATE INDEX IF NOT EXISTS ix_protocols_organisation_id ON protocols(organisation_id);
CREATE INDEX IF NOT EXISTS ix_protocol_tests_organisation_id ON protocol_tests(organisation_id);

-- The API connection role must not be a table owner and must not have
-- BYPASSRLS. FORCE protects even accidental owner-like access paths.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tests', 'categories', 'protocols', 'protocol_tests',
    'organisation_memberships', 'developer_applications', 'access_requests',
    'approval_decisions', 'active_grants', 'audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organisation_id::text = current_setting(''app.current_organisation_id'', true)) WITH CHECK (organisation_id::text = current_setting(''app.current_organisation_id'', true))',
      table_name
    );
  END LOOP;
END $$;

-- Audit events cannot be updated or deleted by the runtime role. Replace
-- chemat_app with the actual least-privilege application role if different.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM chemat_app;
    GRANT SELECT, INSERT ON audit_events TO chemat_app;
  END IF;
END $$;

INSERT INTO api_definitions (name, version, description, classification, scopes)
VALUES
  ('Research tests', 'v1', 'Tenant-scoped research test results', 'consortium', '["tests:read"]'),
  ('Experimental data', 'v1', 'Tenant-scoped experimental datasets', 'restricted', '["experimental-data:read"]'),
  ('Protocol files', 'v1', 'Authorised protocol metadata and downloads', 'consortium', '["protocol-files:read", "protocol-files:download"]'),
  ('File navigation', 'v1', 'Tenant-scoped file navigation', 'consortium', '["files:navigate", "files:read"]')
ON CONFLICT (name) DO NOTHING;

COMMIT;
