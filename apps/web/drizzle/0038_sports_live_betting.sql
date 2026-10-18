ALTER TABLE "sports_live_tests" ALTER COLUMN "accepted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_live_tests" ALTER COLUMN "quote_age_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_live_tests" ALTER COLUMN "state_age_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_leagues" ADD COLUMN "live_betting" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_live_tests" ADD COLUMN "outcome" text DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_live_tests" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "sports_live_tests" ADD COLUMN "league_id" uuid;--> statement-breakpoint
ALTER TABLE "sports_live_tests" ADD COLUMN "pick_id" uuid;