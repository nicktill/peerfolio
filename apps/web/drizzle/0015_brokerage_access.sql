CREATE TABLE "production_link_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"public_token_digest" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"plaid_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "brokerage_linking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "production_link_attempts_token_idx" ON "production_link_attempts" USING btree ("public_token_digest");