CREATE TABLE "live_worker" (
	"name" text PRIMARY KEY NOT NULL,
	"last_cycle_at" timestamp with time zone NOT NULL,
	"last_ok_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
