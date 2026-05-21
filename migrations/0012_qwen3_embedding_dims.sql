DROP INDEX IF EXISTS "idx_entities_name_embedding";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_entity_aliases_embedding";--> statement-breakpoint
ALTER TABLE "entities" ALTER COLUMN "name_embedding" TYPE vector(1024) USING NULL;--> statement-breakpoint
ALTER TABLE "entity_aliases" ALTER COLUMN "name_embedding" TYPE vector(1024) USING NULL;--> statement-breakpoint
CREATE INDEX "idx_entities_name_embedding" ON "entities" USING hnsw ("name_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_entity_aliases_embedding" ON "entity_aliases" USING hnsw ("name_embedding" vector_cosine_ops);
