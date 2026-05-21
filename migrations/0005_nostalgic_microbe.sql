CREATE TABLE "employee_tag_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emp_id" text NOT NULL,
	"tag_id" uuid NOT NULL,
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_employee_tag" UNIQUE("emp_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "employee_tag_map" ADD CONSTRAINT "employee_tag_map_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_tag_map" ADD CONSTRAINT "employee_tag_map_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;