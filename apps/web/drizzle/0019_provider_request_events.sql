CREATE TABLE IF NOT EXISTS "provider_request_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"http_status" integer,
	"endpoint" text NOT NULL,
	"symbols_count" integer DEFAULT 0 NOT NULL,
	"symbols_sample" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"wait_seconds" integer,
	"caller" text,
	"suppressed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_request_events_at_idx" ON "provider_request_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_request_events_provider_kind_at_idx" ON "provider_request_events" USING btree ("provider","kind","at");