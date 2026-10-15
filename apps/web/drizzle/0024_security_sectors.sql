ALTER TABLE "securities" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "sector_checked_at" timestamp with time zone;