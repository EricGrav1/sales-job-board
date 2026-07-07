CREATE TYPE "public"."event_type" AS ENUM('profile_view', 'proof_view', 'signup', 'publish');--> statement-breakpoint
CREATE TYPE "public"."proof_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."proof_type" AS ENUM('leaderboard', 'commission', 'award', 'other');--> statement-breakpoint
CREATE TYPE "public"."role_type" AS ENUM('sdr', 'ae', 'am', 'field', 'inside', 'manager', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('rep', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_tier" AS ENUM('unverified', 'self_reported', 'verified');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"type" "event_type" NOT NULL,
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"quota_attainment_pct" integer,
	"rank" integer,
	"team_size" integer,
	"notes" varchar(280),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"performance_record_id" uuid,
	"original_key" text NOT NULL,
	"redacted_key" text,
	"thumb_key" text,
	"type" "proof_type" NOT NULL,
	"status" "proof_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rep_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"headline" varchar(120),
	"bio" text,
	"role_type" "role_type",
	"industries" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"years_experience" integer,
	"ote_min" integer,
	"ote_max" integer,
	"location" text,
	"remote_ok" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"verification_tier" "verification_tier" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rep_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "rep_profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'rep' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_records" ADD CONSTRAINT "performance_records_profile_id_rep_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."rep_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_items" ADD CONSTRAINT "proof_items_profile_id_rep_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."rep_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_items" ADD CONSTRAINT "proof_items_performance_record_id_performance_records_id_fk" FOREIGN KEY ("performance_record_id") REFERENCES "public"."performance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_items" ADD CONSTRAINT "proof_items_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_profiles" ADD CONSTRAINT "rep_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;