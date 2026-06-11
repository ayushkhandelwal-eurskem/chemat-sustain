-- ===========================================================================
-- CheMat tree feature — full schema, no Alembic.
-- Combines all three migrations (folder tree + protocol files + display_name).
-- Idempotent: safe to run more than once (IF NOT EXISTS everywhere).
--
-- Run against the DEV database:
--   docker compose -f docker-compose-dev.yml exec -T db \
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < setup_tree.sql
-- ===========================================================================

-- 1. Categories (top-level, renameable) ------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Protocols (sub-folders inside a category, with an optional file) -------
CREATE TABLE IF NOT EXISTS protocols (
    id           SERIAL PRIMARY KEY,
    category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    -- file columns (nullable until a file is uploaded)
    file_path    TEXT,
    file_name    TEXT,
    file_mime    TEXT,
    file_size    INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protocols_category ON protocols(category_id);

-- 3. Tests inside a protocol (one protocol per test) ------------------------
CREATE TABLE IF NOT EXISTS protocol_tests (
    id                 SERIAL PRIMARY KEY,
    protocol_id        INTEGER NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
    work_package_name  TEXT NOT NULL,
    element_cms_id     TEXT NOT NULL,
    test_name          TEXT NOT NULL,
    display_name       TEXT,            -- editable label; test_name stays the data key
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protocol_tests_protocol ON protocol_tests(protocol_id);

-- one protocol per test (a test triple can't appear twice)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_protocol_tests_triple'
    ) THEN
        ALTER TABLE protocol_tests
            ADD CONSTRAINT uq_protocol_tests_triple
            UNIQUE (work_package_name, element_cms_id, test_name);
    END IF;
END $$;

-- 4. Seed the starting categories (only if the table is empty) --------------
INSERT INTO categories (name, sort_order)
SELECT * FROM (VALUES
    ('Human Toxicity', 0),
    ('Physico-Chemical Characteristics', 1),
    ('Uncategorized', 2)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM categories);

-- Done. Verify with:
--   \dt
--   \d protocols
--   \d protocol_tests
--   SELECT * FROM categories;