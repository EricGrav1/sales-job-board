CREATE TYPE "public"."application_status" AS ENUM('new', 'reviewed', 'interviewing', 'offer', 'hired', 'rejected');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid,
	"full_name" varchar(120) NOT NULL,
	"phone" varchar(40),
	"linkedin_url" text,
	"resume_key" text,
	"cover_note" varchar(3000),
	"status" "application_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_job_user_unique" UNIQUE("job_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_profile_id_rep_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."rep_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_user_idx" ON "applications" USING btree ("user_id");