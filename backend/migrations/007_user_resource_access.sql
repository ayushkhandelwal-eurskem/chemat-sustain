-- User/email-based API access. Production schema is the source of truth:
-- this migration only adds new tables and does not alter any existing table.

BEGIN;

CREATE TABLE IF NOT EXISTS user_access_profiles (
    user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    all_tests boolean NOT NULL DEFAULT false,
    all_protocols boolean NOT NULL DEFAULT false,
    all_files boolean NOT NULL DEFAULT false,
    is_platform_tester boolean NOT NULL DEFAULT false,
    audit_organisation_id varchar(36) REFERENCES organisations(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_access_profiles
    ADD COLUMN IF NOT EXISTS audit_organisation_id varchar(36)
    REFERENCES organisations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS user_test_access (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_id integer NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, test_id)
);

CREATE TABLE IF NOT EXISTS user_protocol_access (
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    protocol_id integer NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, protocol_id)
);

CREATE INDEX IF NOT EXISTS ix_user_test_access_test ON user_test_access(test_id);
CREATE INDEX IF NOT EXISTS ix_user_protocol_access_protocol ON user_protocol_access(protocol_id);

-- Current Eurskem platform candidates must be able to validate the complete
-- API before partner credentials are distributed. This is an explicit,
-- auditable profile assignment, not an application-level email-domain bypass.
-- Future candidates are enabled deliberately from Backoffice > API Access.
INSERT INTO user_access_profiles (
    user_id, all_tests, all_protocols, all_files, is_platform_tester,
    audit_organisation_id, updated_at
)
SELECT u.id, true, true, true, true, o.id, now()
FROM users u
LEFT JOIN organisations o ON o.slug = 'eurskem'
WHERE u.is_active = true AND lower(u.email) LIKE '%@eurskem.com'
ON CONFLICT (user_id) DO UPDATE SET
    all_tests = true,
    all_protocols = true,
    all_files = true,
    is_platform_tester = true,
    audit_organisation_id = EXCLUDED.audit_organisation_id,
    updated_at = now();

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_access_profiles TO chemat_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_test_access TO chemat_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_protocol_access TO chemat_app;
    END IF;
END $$;

COMMIT;