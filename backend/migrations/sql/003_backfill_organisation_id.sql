-- ===========================================================================
-- 003_backfill_organisation_id.sql  (Phase 5)
--
-- THE ONLY DATA-MODIFYING MIGRATION IN THIS PHASE.
--
-- Requires a verified backup first. As of 2026-08-03 a restore-tested
-- production backup exists at /root/prod-backups/2026-08-03/ - see
-- docs/security/deployment-readiness.md.
--
-- Both mappings below were reviewed and signed off (see
-- docs/security/tenant-isolation-design.md). Nothing is silently assigned:
-- anything not matched by an explicit rule lands in the `unassigned`
-- quarantine tenant, which has no members and therefore no access.
--
-- Runs in a single transaction and prints a reconciliation report at the end.
-- Re-runnable: only touches rows where organisation_id IS NULL.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Mapping 1: users -> organisations, by verified email domain.
--
-- NOTE the Lodz distinction, which is deliberate and must not be "simplified":
--   p.lodz.pl            -> tul    (Lodz University of Technology)
--   chemia.uni.lodz.pl   -> ulodz  (University of Lodz)
-- These are two different institutions. Merging them would cross-contaminate
-- 13 of the 19 users.
--
-- Signed off by the platform owner on 2026-08-03:
--   * gmail.com and proton.me (2 admin accounts on personal addresses)
--     -> eurskem, confirmed as coordinator staff.
--   * chemia.uni.lodz (malformed, missing .pl) -> ulodz, confirmed typo.
-- ---------------------------------------------------------------------------
UPDATE users u SET organisation_id = o.id
FROM organisations o
WHERE u.organisation_id IS NULL
  AND o.slug = CASE split_part(u.email, '@', 2)
                   WHEN 'p.lodz.pl'          THEN 'tul'
                   WHEN 'chemia.uni.lodz.pl' THEN 'ulodz'
                   WHEN 'chemia.uni.lodz'    THEN 'ulodz'    -- malformed domain, confirmed
                   WHEN 'eurskem.com'        THEN 'eurskem'
                   WHEN 'mmu.ac.uk'          THEN 'mmu'
                   WHEN 'gmail.com'          THEN 'eurskem'  -- confirmed coordinator staff
                   WHEN 'proton.me'          THEN 'eurskem'  -- confirmed coordinator staff
                   ELSE 'unassigned'
               END;

-- ---------------------------------------------------------------------------
-- Mapping 2: tests -> organisations, derived from the data itself.
--
-- Every one of the 327 production test records carries a partner acronym at
-- test_details->'work_package'->>'partner' (verified: zero NULLs). upper()
-- normalises the UNIURB/UniUrb case variance.
--
-- Expected distribution: ULODZ 147, AWI 76, TUL 48, UNIURB 56 (40 + 16).
-- ---------------------------------------------------------------------------
UPDATE tests t SET organisation_id = o.id
FROM organisations o
WHERE t.organisation_id IS NULL
  AND o.slug = CASE upper(trim(t.test_details -> 'work_package' ->> 'partner'))
                   WHEN 'ULODZ'  THEN 'ulodz'
                   WHEN 'AWI'    THEN 'awi'
                   WHEN 'TUL'    THEN 'tul'
                   WHEN 'UNIURB' THEN 'uniurb'
                   WHEN 'HAW'    THEN 'haw'
                   WHEN 'DTU'    THEN 'dtu'
                   WHEN 'UNIBO'  THEN 'unibo'
                   WHEN 'PQSAR'  THEN 'protoqsar'
                   WHEN 'IVL'    THEN 'ivl'
                   WHEN 'MMU'    THEN 'mmu'
                   WHEN 'EKE'    THEN 'eurskem'
                   ELSE 'unassigned'   -- unknown/missing attribution: quarantine, never guess
               END;

-- ---------------------------------------------------------------------------
-- Derived tables: inherit the tenant from their parent rather than guessing.
-- ---------------------------------------------------------------------------
UPDATE sessions s SET organisation_id = u.organisation_id
FROM users u
WHERE s.organisation_id IS NULL AND s.user_id = u.id;

UPDATE protocol_tests pt SET organisation_id = p.organisation_id
FROM protocols p
WHERE pt.organisation_id IS NULL AND pt.protocol_id = p.id;

-- Anything still NULL after the parent-based passes (orphans, or protocols
-- which have no attribution source at all) goes to quarantine explicitly.
UPDATE protocols      SET organisation_id = (SELECT id FROM organisations WHERE slug='unassigned') WHERE organisation_id IS NULL;
UPDATE protocol_tests SET organisation_id = (SELECT id FROM organisations WHERE slug='unassigned') WHERE organisation_id IS NULL;
UPDATE sessions       SET organisation_id = (SELECT id FROM organisations WHERE slug='unassigned') WHERE organisation_id IS NULL;

-- ---------------------------------------------------------------------------
-- Reconciliation report. Inspect this before running 004 (enforcement).
-- Anything in `unassigned` is invisible to every partner by design - review
-- those rows rather than assuming the backfill was complete.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== users per organisation (expect tul 10, ulodz 4, eurskem 4, mmu 1) ==='
SELECT o.slug, count(*) AS users
FROM users u JOIN organisations o ON o.id = u.organisation_id
GROUP BY o.slug ORDER BY users DESC;

\echo ''
\echo '=== tests per organisation (expect ulodz 147, awi 76, uniurb 56, tul 48) ==='
SELECT o.slug, count(*) AS tests
FROM tests t JOIN organisations o ON o.id = t.organisation_id
GROUP BY o.slug ORDER BY tests DESC;

\echo ''
\echo '=== QUARANTINED rows (should be 0 for tests/users - investigate if not) ==='
SELECT 'tests' AS tbl, count(*) FROM tests t JOIN organisations o ON o.id=t.organisation_id WHERE o.slug='unassigned'
UNION ALL SELECT 'users', count(*) FROM users u JOIN organisations o ON o.id=u.organisation_id WHERE o.slug='unassigned'
UNION ALL SELECT 'protocols', count(*) FROM protocols p JOIN organisations o ON o.id=p.organisation_id WHERE o.slug='unassigned'
UNION ALL SELECT 'protocol_tests', count(*) FROM protocol_tests pt JOIN organisations o ON o.id=pt.organisation_id WHERE o.slug='unassigned';

\echo ''
\echo '=== remaining NULLs (MUST all be 0 before running 004) ==='
SELECT 'tests' AS tbl, count(*) FROM tests WHERE organisation_id IS NULL
UNION ALL SELECT 'users', count(*) FROM users WHERE organisation_id IS NULL
UNION ALL SELECT 'sessions', count(*) FROM sessions WHERE organisation_id IS NULL
UNION ALL SELECT 'protocols', count(*) FROM protocols WHERE organisation_id IS NULL
UNION ALL SELECT 'protocol_tests', count(*) FROM protocol_tests WHERE organisation_id IS NULL;

COMMIT;
