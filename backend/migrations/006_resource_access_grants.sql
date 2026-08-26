-- Share tests and protocols with multiple organisations without changing
-- ownership. The legacy admin endpoint assigned access by overwriting
-- tests.organisation_id/protocols.organisation_id, so one resource could only
-- be visible to one partner. These grant tables separate access from ownership.

BEGIN;

CREATE TABLE IF NOT EXISTS organisation_test_access (
    organisation_id varchar(36) NOT NULL
        REFERENCES organisations(id) ON DELETE CASCADE,
    test_id integer NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organisation_id, test_id)
);

CREATE TABLE IF NOT EXISTS organisation_protocol_access (
    organisation_id varchar(36) NOT NULL
        REFERENCES organisations(id) ON DELETE CASCADE,
    protocol_id integer NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organisation_id, protocol_id)
);

CREATE INDEX IF NOT EXISTS ix_organisation_test_access_test
    ON organisation_test_access(test_id);
CREATE INDEX IF NOT EXISTS ix_organisation_protocol_access_protocol
    ON organisation_protocol_access(protocol_id);

ALTER TABLE organisation_test_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_test_access FORCE ROW LEVEL SECURITY;
ALTER TABLE organisation_protocol_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_protocol_access FORCE ROW LEVEL SECURITY;

-- The separately staged tenancy migration set already defines this helper,
-- while the numbered 001-006 sequence does not. Define the same compatible
-- function here so fresh CI and production upgrades converge safely.
CREATE OR REPLACE FUNCTION is_platform_governance() RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.platform_governance', true), 'off') = 'on'
$$;

CREATE OR REPLACE FUNCTION current_access_organisation_id() RETURNS varchar(36)
LANGUAGE sql STABLE AS $$
    SELECT id FROM organisations
     WHERE slug = current_setting('app.current_organisation_id', true)
        OR id   = current_setting('app.current_organisation_id', true)
     LIMIT 1
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
        GRANT EXECUTE ON FUNCTION is_platform_governance() TO chemat_app;
        GRANT EXECUTE ON FUNCTION current_access_organisation_id() TO chemat_app;
    END IF;
END $$;

DROP POLICY IF EXISTS tenant_access ON organisation_test_access;
CREATE POLICY tenant_access ON organisation_test_access
    FOR SELECT
    USING (organisation_id = current_access_organisation_id() OR is_platform_governance());

DROP POLICY IF EXISTS governance_write ON organisation_test_access;
CREATE POLICY governance_write ON organisation_test_access
    FOR ALL
    USING (is_platform_governance())
    WITH CHECK (is_platform_governance());

DROP POLICY IF EXISTS tenant_access ON organisation_protocol_access;
CREATE POLICY tenant_access ON organisation_protocol_access
    FOR SELECT
    USING (organisation_id = current_access_organisation_id() OR is_platform_governance());

DROP POLICY IF EXISTS governance_write ON organisation_protocol_access;
CREATE POLICY governance_write ON organisation_protocol_access
    FOR ALL
    USING (is_platform_governance())
    WITH CHECK (is_platform_governance());

-- Permit granted tests through RLS as well as explicit application filters.
DROP POLICY IF EXISTS tests_read ON tests;
CREATE POLICY tests_read ON tests
    FOR SELECT
    USING (
        is_platform_governance()
        OR organisation_id = current_access_organisation_id()
        OR is_public = true
        OR EXISTS (
            SELECT 1 FROM organisation_test_access access
            WHERE access.test_id = tests.id
              AND access.organisation_id = current_access_organisation_id()
        )
    );

-- Protocol reads can be shared; writes remain owner-only.
DROP POLICY IF EXISTS tenant_isolation ON protocols;
DROP POLICY IF EXISTS protocols_read ON protocols;
DROP POLICY IF EXISTS protocols_write ON protocols;
CREATE POLICY protocols_read ON protocols
    FOR SELECT
    USING (
        is_platform_governance()
        OR organisation_id = current_access_organisation_id()
        OR EXISTS (
            SELECT 1 FROM organisation_protocol_access access
            WHERE access.protocol_id = protocols.id
              AND access.organisation_id = current_access_organisation_id()
        )
    );
CREATE POLICY protocols_write ON protocols
    FOR ALL
    USING (organisation_id = current_access_organisation_id())
    WITH CHECK (organisation_id = current_access_organisation_id());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_test_access TO chemat_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON organisation_protocol_access TO chemat_app;
    END IF;
END $$;

COMMIT;