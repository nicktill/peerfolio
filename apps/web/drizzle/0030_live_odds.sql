CREATE TABLE "live_quote" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"market" text NOT NULL,
	"selection" text NOT NULL,
	"source" text NOT NULL,
	"bid" double precision,
	"ask" double precision,
	"mid" double precision,
	"source_ts" timestamp with time zone,
	"fetched_ts" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_state" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"period" text,
	"clock" text,
	"source" text NOT NULL,
	"source_ts" timestamp with time zone,
	"fetched_ts" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_worker" (
	"name" text PRIMARY KEY NOT NULL,
	"last_cycle_at" timestamp with time zone NOT NULL,
	"last_ok_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_quote" ADD CONSTRAINT "live_quote_event_id_sports_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sports_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_state" ADD CONSTRAINT "live_state_event_id_sports_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sports_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_quote_key_idx" ON "live_quote" USING btree ("event_id","market","selection","source","fetched_ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "live_quote_fetched_idx" ON "live_quote" USING btree ("fetched_ts");