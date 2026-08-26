-- Compatibility marker for migration sequence 005.
--
-- The UUID-to-varchar conversion previously stored at this path was a
-- destructive, one-off repair for legacy databases created by an old
-- SQLAlchemy auto-DDL schema. It is not a forward migration and must never run
-- automatically against fresh CI or production databases, whose identifiers
-- are already varchar(36) after migrations 001-004.
--
-- The legacy repair is retained for explicit, operator-reviewed use at:
--   backend/scripts/repairs/align_legacy_uuid_columns_with_models.sql
--
-- This marker is intentionally data- and schema-neutral, making the numbered
-- migration sequence safe and repeatable in every environment.

BEGIN;
DO $$
BEGIN
    RAISE NOTICE 'Migration 005: no action required; schema is already varchar(36)';
END
$$;
COMMIT;
