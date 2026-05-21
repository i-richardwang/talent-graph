ALTER TABLE "tags" ALTER COLUMN "entity_type" DROP NOT NULL;--> statement-breakpoint
-- Clean up the polymorphic `entity_type='employee'` sentinel before adding the
-- CHECK. Asserted-mode tags (固化型,直打员工) now have entity_type=NULL; the
-- routing key moves from string-equality to NULL/non-NULL.
UPDATE "tags" SET "entity_type" = NULL WHERE "entity_type" = 'employee';--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_entity_type_not_employee" CHECK ("tags"."entity_type" IS NULL OR "tags"."entity_type" <> 'employee');
