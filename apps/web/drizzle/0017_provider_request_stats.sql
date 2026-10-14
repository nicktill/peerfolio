CREATE TABLE IF NOT EXISTS "provider_request_stats" (
	"provider" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"symbols" integer DEFAULT 0 NOT NULL,
	"denied" integer DEFAULT 0 NOT NULL,
	"rate_limited" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "provider_request_stats_provider_minute_pk" PRIMARY KEY("provider","minute")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_request_stats_minute_idx" ON "provider_request_stats" USING btree ("minute");