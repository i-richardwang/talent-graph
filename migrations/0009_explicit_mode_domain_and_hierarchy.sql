-- Split tags.entity_type's two implicit jobs into orthogonal columns:
--   * mode   = 'list' | 'assertion'   (how membership is decided)
--   * domain = 'school' | 'company' | NULL  (which entity kind, list-mode only)
--
-- Old encoding: NULL entity_type → assertion; non-NULL → list with that domain.
-- New encoding: explicit mode + domain, CHECK enforces consistency.
--
-- Also:
--   * entities.parent_id (self FK, ON DELETE SET NULL) for entity hierarchy
--     (e.g. 阿里巴巴 → 菜鸟). Used by tag_entity_map.match_mode='subtree'
--     traversal in downstream JOIN.
--   * tag_entity_map.match_mode (DEFAULT 'subtree') decides whether a tag link
--     covers only the directly-attached entity or its whole subtree.

-- 1. tags: add mode + domain, backfill from entity_type, drop entity_type.
ALTER TABLE "tags" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "domain" text;--> statement-breakpoint

UPDATE "tags"
SET
  "mode" = CASE WHEN "entity_type" IS NULL THEN 'assertion' ELSE 'list' END,
  "domain" = "entity_type";--> statement-breakpoint

ALTER TABLE "tags" ALTER COLUMN "mode" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_mode_values"
  CHECK ("mode" IN ('list','assertion'));--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_mode_domain_consistency"
  CHECK (
    ("mode" = 'list' AND "domain" IS NOT NULL)
    OR ("mode" = 'assertion' AND "domain" IS NULL)
  );--> statement-breakpoint

DROP INDEX IF EXISTS "idx_tags_entity_type";--> statement-breakpoint
ALTER TABLE "tags" DROP COLUMN "entity_type";--> statement-breakpoint
CREATE INDEX "idx_tags_mode_domain" ON "tags" USING btree ("mode","domain");--> statement-breakpoint

-- 2. entities: parent_id self-FK for hierarchy.
ALTER TABLE "entities" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_id_entities_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."entities"("id")
  ON DELETE SET NULL ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_entities_parent" ON "entities" USING btree ("parent_id");--> statement-breakpoint

-- 3. tag_entity_map: match_mode (default 'subtree' = inclusive of descendants).
ALTER TABLE "tag_entity_map" ADD COLUMN "match_mode" text DEFAULT 'subtree' NOT NULL;--> statement-breakpoint
ALTER TABLE "tag_entity_map" ADD CONSTRAINT "tag_entity_map_match_mode_values"
  CHECK ("match_mode" IN ('exact','subtree'));
