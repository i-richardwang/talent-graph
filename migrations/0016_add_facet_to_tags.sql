-- Add tags.facet: a semantic-role sub-axis for list-mode tags, orthogonal to
-- (mode, kind). For list tags `kind` is pinned to entity_type (school/company),
-- so it cannot distinguish "both kind=company, but one is a notable-employer
-- cluster and the other an industry classification". `facet` carries that:
--   'school_tier'      — school tier lists (清北/985/QS)         [kind=school]
--   'notable_employer' — notable employer clusters (MBB/四大/BAT) [kind=company]
--   'industry'         — employer-industry classification         [kind=company]
-- assertion-mode tags carry NULL (facet is a list-mode concept).
--
-- Nullable, no CHECK: values are an open, documented set; new roles may appear.
-- Non-destructive: ADD COLUMN nullable is metadata-only (no table rewrite); the
-- two UPDATEs touch ONLY the new column on the 33 existing list tags, never
-- tag_code/name/mode/kind/description. Idempotent (IF NOT EXISTS + value-stable
-- UPDATEs). Rollback: DROP COLUMN "facet" (existing data unaffected).

ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "facet" text;--> statement-breakpoint

UPDATE "tags" SET "facet" = 'school_tier'      WHERE "mode" = 'list' AND "kind" = 'school'  AND "facet" IS NULL;--> statement-breakpoint
UPDATE "tags" SET "facet" = 'notable_employer' WHERE "mode" = 'list' AND "kind" = 'company' AND "facet" IS NULL;
