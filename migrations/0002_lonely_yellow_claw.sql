CREATE TABLE "employee_educations" (
	"id" serial PRIMARY KEY NOT NULL,
	"emp_id" text NOT NULL,
	"school" text NOT NULL,
	"major" text,
	"degree" text,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_resumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"emp_id" text NOT NULL,
	"work_list" text NOT NULL,
	"update_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_work_experiences" (
	"id" serial PRIMARY KEY NOT NULL,
	"emp_id" text NOT NULL,
	"company_name" text NOT NULL,
	"position_title" text,
	"start_date" date,
	"end_date" date,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"emp_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_educations" ADD CONSTRAINT "employee_educations_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_resumes" ADD CONSTRAINT "employee_resumes_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_experiences" ADD CONSTRAINT "employee_work_experiences_emp_id_employees_emp_id_fk" FOREIGN KEY ("emp_id") REFERENCES "public"."employees"("emp_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_employee_edu_emp_id" ON "employee_educations" USING btree ("emp_id");--> statement-breakpoint
CREATE INDEX "idx_employee_resumes_emp_updated" ON "employee_resumes" USING btree ("emp_id",update_time DESC);--> statement-breakpoint
CREATE INDEX "idx_employee_work_exp_emp_id" ON "employee_work_experiences" USING btree ("emp_id");