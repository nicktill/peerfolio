ALTER TABLE "users" ADD COLUMN "brokerage_linking_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "brokerage_link_limit" integer;