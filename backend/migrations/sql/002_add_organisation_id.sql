-- ===========================================================================
-- 002_add_organisation_id.sql  (Phase 5)
--
-- Adds organisation_id to the tenant-owned tables, NULLABLE for now.
--
-- Deliberately separated from the backfill (003) and from enforcement (004):
-- this step changes no data and no behaviour, so it is safe to deploy on its
-- own and can sit in production while the backfill mapping is reviewed.
--
-- `categories` is intentionally NOT given an organisation_id - it is shared
-- consortium reference data, not any single tenant's data. See
-- docs/security/tenant-isolation-design.md for that decision.
--
-- Idempotent - safe to re-run.
-- ===========================================================================

ALTER TABLE tests           ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations (id);
ALTER TABLE users           ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations (id);
ALTER TABLE sessions        ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations (id);
ALTER TABLE protocols       ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations (id);
ALTER TABLE protocol_tests  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations (id);

-- Indexed because every tenant-scoped query and every RLS policy filters on
-- this column.
CREATE INDEX IF NOT EXISTS idx_tests_org          ON tests (organisation_id);
CREATE INDEX IF NOT EXISTS idx_users_org          ON users (organisation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_org       ON sessions (organisation_id);
CREATE INDEX IF NOT EXISTS idx_protocols_org      ON protocols (organisation_id);
CREATE INDEX IF NOT EXISTS idx_protocol_tests_org ON protocol_tests (organisation_id);
