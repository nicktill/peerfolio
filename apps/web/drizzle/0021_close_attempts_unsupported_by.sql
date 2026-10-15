ALTER TABLE "securities" ADD COLUMN "close_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "close_attempt_session" date;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "unsupported_by" text[];