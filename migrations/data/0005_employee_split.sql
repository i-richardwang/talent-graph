-- One-shot data migration paired with schema migration 0005.
-- Run AFTER 0005_*.sql has been applied (drizzle does NOT auto-run files in
-- this directory; execute manually via docker exec / psql).
--
-- Purpose:
--   Move existing employee->tag mappings out of tag_entity_map (which referenced
--   synthetic "shadow" entity rows where entity_type='employee') into the new
--   employee_tag_map table, then delete the shadow entities.
--
-- Safe to re-run: each statement is idempotent or no-ops on empty input.
BEGIN;

-- 1. Copy live mappings.
INSERT INTO employee_tag_map (emp_id, tag_id, reasoning, created_at)
SELECT e.canonical_name, m.tag_id, m.reasoning, m.created_at
FROM tag_entity_map m
JOIN entities e ON e.id = m.entity_id
WHERE e.entity_type = 'employee'
ON CONFLICT (emp_id, tag_id) DO NOTHING;

-- 2. Drop old mappings (the entities they reference are about to disappear).
DELETE FROM tag_entity_map
WHERE entity_id IN (SELECT id FROM entities WHERE entity_type = 'employee');

-- 3. Drop the shadow entity rows. entity_aliases.entity_type='employee' rows
--    (if any) would block this via FK; we asserted there are none upfront.
DELETE FROM entities WHERE entity_type = 'employee';

COMMIT;
