CREATE TYPE "public"."apply_method" AS ENUM('platform', 'external');--> statement-breakpoint
CREATE TYPE "public"."comp_type" AS ENUM('base_plus_commission', 'commission_only', 'salary_only');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'contract', 'internship');--> statement-breakpoint
CREATE TYPE "public"."job_category" AS ENUM('sdr_bdr', 'account_executive', 'account_manager', 'customer_success', 'sales_engineer', 'sales_operations', 'channel_partnerships', 'sales_management', 'sales_leadership', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_level" AS ENUM('entry', 'mid', 'senior', 'manager', 'director', 'vp', 'executive');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('draft', 'published', 'closed');--> statement-breakpoint
CREATE TYPE "public"."workplace" AS ENUM('onsite', 'hybrid', 'remote');--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'job_view';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'job_apply';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'job_publish';--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"slug" text NOT NULL,
	"title" varchar(120) NOT NULL,
	"category" "job_category",
	"level" "job_level",
	"employment_type" "employment_type",
	"workplace" "workplace",
	"location" varchar(160),
	"comp_type" "comp_type",
	"base_min" integer,
	"base_max" integer,
	"ote_min" integer,
	"ote_max" integer,
	"description" text,
	"apply_method" "apply_method" DEFAULT 'platform' NOT NULL,
	"apply_url" text,
	"status" "job_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_search_idx" ON "jobs" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("location", '')));--> statement-breakpoint
CREATE INDEX "jobs_listing_idx" ON "jobs" USING btree ("status","expires_at","published_at");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");