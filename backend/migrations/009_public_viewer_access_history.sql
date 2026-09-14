-- Self-registered public viewers and a short-lived data-access register.
-- Idempotent except for PostgreSQL's ALTER TYPE transaction visibility rule:
-- apply this migration as a file through psql, as with the preceding migrations.

BEGIN;

ALTER TYPE role ADD VALUE IF NOT EXISTS 'public_viewer';

ALTER TABLE users ADD COLUMN IF NOT EXISTS name varchar(200);

-- Some installations applied the older sql/004 migration, which made every
-- user a consortium tenant member. External public viewers deliberately have
-- no tenant; role-based authorization keeps them on the public masking path.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'organisation_id'
    ) THEN
        ALTER TABLE users ALTER COLUMN organisation_id DROP NOT NULL;
        COMMENT ON COLUMN users.organisation_id IS
        'NULL only for external public_viewer accounts; consortium users remain tenant-bound.';
    END IF;
END $$;

-- The corresponding external viewer session is also intentionally tenantless
-- on installations that carry the older sessions.organisation_id column.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'sessions'
          AND column_name = 'organisation_id'
    ) THEN
        ALTER TABLE sessions ALTER COLUMN organisation_id DROP NOT NULL;
        COMMENT ON COLUMN sessions.organisation_id IS
        'NULL only for sessions belonging to external public_viewer accounts.';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public_data_access_events (
    event_id varchar(36) PRIMARY KEY,
    user_id integer REFERENCES users(id) ON DELETE SET NULL,
    user_name varchar(200) NOT NULL,
    user_email varchar(320) NOT NULL,
    test_id integer REFERENCES tests(id) ON DELETE SET NULL,
    test_name varchar(160) NOT NULL,
    work_package_name varchar(160) NOT NULL,
    element_cms_id varchar(160) NOT NULL,
    organisation_id varchar(36),
    access_level varchar(20) NOT NULL CHECK (access_level IN ('public', 'private')),
    released_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
    request_id varchar(80),
    source_endpoint varchar(160) NOT NULL,
    accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_public_access_user_id
    ON public_data_access_events(user_id);
CREATE INDEX IF NOT EXISTS ix_public_access_test_id
    ON public_data_access_events(test_id);
CREATE INDEX IF NOT EXISTS ix_public_access_email_lower
    ON public_data_access_events(lower(user_email));
CREATE INDEX IF NOT EXISTS ix_public_access_accessed_at
    ON public_data_access_events(accessed_at);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chemat_app') THEN
        GRANT SELECT, INSERT, DELETE ON public_data_access_events TO chemat_app;
    END IF;
END $$;

COMMIT;