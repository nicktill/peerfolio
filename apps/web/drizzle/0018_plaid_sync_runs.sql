CREATE TABLE IF NOT EXISTS "plaid_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"request_id" text,
	"accounts_received" integer DEFAULT 0 NOT NULL,
	"holdings_received" integer DEFAULT 0 NOT NULL,
	"holdings_kept" integer DEFAULT 0 NOT NULL,
	"holdings_skipped" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"currency_assumed" integer DEFAULT 0 NOT NULL,
	"securities_missing_ticker" integer DEFAULT 0 NOT NULL,
	"balance_without_holdings" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plaid_sync_runs_started_idx" ON "plaid_sync_runs" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plaid_sync_runs_item_idx" ON "plaid_sync_runs" USING btree ("item_id","started_at");
