-- Tighten the schema invariant left half-finished by 0005_nostalgic_microbe and
-- 0006_tag_mode_split: `entity_type='employee'` is no longer a valid value
-- anywhere in the entity domain. 0006 added the CHECK on `tags`; this migration
-- finishes the symmetry on `entities` and `entity_aliases`.
--
-- Defensive cleanup before the CHECKs are added — no-op on a clean DB, but
-- guarantees the migration succeeds even if a stray row was created via the
-- pre-CHECK CLI (no guard existed before this migration).
DELETE FROM "entity_aliases" WHERE "entity_type" = 'employee';--> statement-breakpoint
DELETE FROM "entities" WHERE "entity_type" = 'employee';--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_entity_type_not_employee" CHECK ("entities"."entity_type" <> 'employee');--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_type_not_employee" CHECK ("entity_aliases"."entity_type" <> 'employee');
