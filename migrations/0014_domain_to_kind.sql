-- Generalize tags.domain → tags.kind: one unified taxonomy column for all tag
-- categories (school / company / skill / experience / ...), orthogonal to `mode`.
--
-- Before: mode(list/assertion) + domain(school/company/NULL), asymmetric —
--   domain served list-mode only (CHECK: assertion → domain IS NULL), so the
--   assertion sub-type (skill vs experience) had no home.
-- After:  mode(list/assertion) + kind(NOT NULL), symmetric —
--   * mode=list      → kind is any non-null entity_type (school/company/...),
--                      enforced against entities.entity_type at `tag link` time.
--   * mode=assertion → kind ∈ {skill, experience} (DB-enforced closed set).
--
-- Data: the 20 existing list-mode tags carry their domain value into kind via
-- RENAME (no UPDATE needed); 0 assertion tags exist, so no backfill conflict.

-- 1. Drop the old asymmetric consistency CHECK (references domain).
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_mode_domain_consistency";--> statement-breakpoint

-- 2. Rename column (preserves all data) + index.
ALTER TABLE "tags" RENAME COLUMN "domain" TO "kind";--> statement-breakpoint
ALTER INDEX IF EXISTS "idx_tags_mode_domain" RENAME TO "idx_tags_mode_kind";--> statement-breakpoint

-- 3. kind is now mandatory for both modes (all existing rows already non-null).
ALTER TABLE "tags" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint

-- 4. Pin assertion-mode kind to the legal closed set. list-mode kind stays open
--    (any non-null value, validated against entity_type downstream).
ALTER TABLE "tags" ADD CONSTRAINT "tags_assertion_kind_values"
  CHECK ("mode" <> 'assertion' OR "kind" IN ('skill','experience'));
