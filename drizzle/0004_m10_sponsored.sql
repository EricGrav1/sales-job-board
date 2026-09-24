CREATE TYPE "public"."credit_ledger_type" AS ENUM('topup', 'click', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."promotion_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"type" "credit_ledger_type" NOT NULL,
	"stripe_checkout_session_id" text,
	"promotion_click_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id")
);
--> statement-breakpoint
CREATE TABLE "promotion_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"day" date NOT NULL,
	"viewer_hash" text NOT NULL,
	"charged_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_clicks_viewer_day_unique" UNIQUE("promotion_id","day","viewer_hash")
);
--> statement-breakpoint
CREATE TABLE "promotion_daily_stats" (
	"promotion_id" uuid NOT NULL,
	"day" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"charged_clicks" integer DEFAULT 0 NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "promotion_daily_stats_promotion_id_day_pk" PRIMARY KEY("promotion_id","day")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" "promotion_status" DEFAULT 'active' NOT NULL,
	"daily_budget_cents" integer NOT NULL,
	"cpc_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_promotion_click_id_promotion_clicks_id_fk" FOREIGN KEY ("promotion_click_id") REFERENCES "public"."promotion_clicks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_clicks" ADD CONSTRAINT "promotion_clicks_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_daily_stats" ADD CONSTRAINT "promotion_daily_stats_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_company_idx" ON "credit_ledger" USING btree ("company_id","created_at");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_credit_balance_non_negative" CHECK ("companies"."credit_balance_cents" >= 0);