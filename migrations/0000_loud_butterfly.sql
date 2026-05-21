CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"canonical_name" text NOT NULL,
	"description" text NOT NULL,
	"name_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_entities_type_name" UNIQUE("entity_type","canonical_name")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_code" text NOT NULL,
	"tag_name" text NOT NULL,
	"entity_type" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_tag_code_unique" UNIQUE("tag_code")
);
--> statement-breakpoint
CREATE TABLE "tag_entity_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tag_entity" UNIQUE("tag_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"raw_name" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"reasoning" text,
	"name_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tag_entity_map" ADD CONSTRAINT "tag_entity_map_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_entity_map" ADD CONSTRAINT "tag_entity_map_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_entities_type" ON "entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_entities_name_embedding" ON "entities" USING hnsw ("name_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_tags_entity_type" ON "tags" USING btree ("entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_entity_aliases_type_raw" ON "entity_aliases" USING btree ("entity_type","raw_name");--> statement-breakpoint
CREATE INDEX "idx_entity_aliases_embedding" ON "entity_aliases" USING hnsw ("name_embedding" vector_cosine_ops);