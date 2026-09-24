CREATE TYPE "public"."company_member_role" AS ENUM('owner');--> statement-breakpoint
CREATE TYPE "public"."company_plan" AS ENUM('free', 'premium');--> statement-breakpoint
CREATE TYPE "public"."company_size_band" AS ENUM('1-10', '11-50', '51-200', '201-1000', '1000+');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'employer' BEFORE 'admin';--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"description" text,
	"size_band" "company_size_band",
	"plan" "company_plan" DEFAULT 'free' NOT NULL,
	"premium_current_period_end" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"credit_balance_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "companies_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "companies_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "company_members" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "company_member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_members_company_id_user_id_pk" PRIMARY KEY("company_id","user_id"),
	CONSTRAINT "company_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;