CREATE TABLE "brokerage_link_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"used_at_request" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "brokerage_link_requests" ADD CONSTRAINT "brokerage_link_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brokerage_link_requests_open_idx" ON "brokerage_link_requests" USING btree ("user_id") WHERE "brokerage_link_requests"."status" = 'open';