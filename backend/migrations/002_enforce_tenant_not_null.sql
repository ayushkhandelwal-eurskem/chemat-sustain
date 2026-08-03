-- Run ONLY after the reviewed ownership mapping has no unresolved rows.
--
-- `categories` is deliberately EXCLUDED below. It holds the shared consortium
-- taxonomy ('Human Toxicity', 'Physico-Chemical Characteristics',
-- 'Uncategorized'), which belongs to no single organisation, so its
-- organisation_id stays NULL by design - see 003_fix_tenant_enforcement.sql,
-- which removes RLS from it and restricts writes by grant instead.
--
-- Including it made this migration unrunnable: on any database holding the real
-- taxonomy it aborted with "categories still contains 3 unassigned rows", so
-- the migration chain could never complete.
BEGIN;

DO $$
DECLARE table_name text; unresolved bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tests', 'protocols', 'protocol_tests']
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE organisation_id IS NULL', table_name) INTO unresolved;
    IF unresolved > 0 THEN
      RAISE EXCEPTION
        '% still contains % unassigned row(s). Backfill ownership through a reviewed mapping first - never assign an organisation silently.',
        table_name, unresolved;
    END IF;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN organisation_id SET NOT NULL', table_name);
  END LOOP;
END $$;

COMMIT;
