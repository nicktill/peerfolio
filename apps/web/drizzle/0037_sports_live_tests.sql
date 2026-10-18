CREATE TABLE "sports_live_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"selection" text NOT NULL,
	"stake" integer NOT NULL,
	"offered_price" integer NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"quote_age_ms" integer NOT NULL,
	"state_age_ms" integer NOT NULL,
	"receipt" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sports_live_tests" ADD CONSTRAINT "sports_live_tests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sports_live_tests_event_idx" ON "sports_live_tests" USING btree ("event_id","accepted_at");--> statement-breakpoint
CREATE INDEX "sports_live_tests_user_idx" ON "sports_live_tests" USING btree ("user_id","accepted_at");