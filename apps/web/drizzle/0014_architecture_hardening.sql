CREATE TABLE "background_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_ai_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reserved_usd" numeric(10, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_removals" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_flow_baselines" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_flow_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"transaction_date" date NOT NULL,
	"applied_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot_steps" (
	"date" date NOT NULL,
	"step" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "flow_baseline_date" date;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "flows_need_baseline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "flow_checked_through" date;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "quote_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "price_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portfolio_flow_baselines" ADD CONSTRAINT "portfolio_flow_baselines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_flow_events" ADD CONSTRAINT "portfolio_flow_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_ai_spend_created_idx" ON "import_ai_spend" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "import_ai_spend_user_created_idx" ON "import_ai_spend" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "portfolio_flow_events_user_idx" ON "portfolio_flow_events" USING btree ("user_id","applied_date");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_steps_date_step_idx" ON "snapshot_steps" USING btree ("date","step");
--> statement-breakpoint
-- Existing flows have already contributed to these snapshots. Never replay
-- them at rollout. Deploy after the nightly snapshot; cutover-day flows remain
-- part of the legacy snapshot rather than being reinterpreted automatically.
INSERT INTO portfolio_flow_baselines (user_id, date)
SELECT user_id, max(date) FROM portfolio_snapshots GROUP BY user_id
ON CONFLICT DO NOTHING;
