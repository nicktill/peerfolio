CREATE TABLE "sports_notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"pick_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sports_events" ADD COLUMN "aliases" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_markets" ADD COLUMN "fair_prob_a" double precision;--> statement-breakpoint
ALTER TABLE "sports_markets" ADD COLUMN "point_a" double precision;--> statement-breakpoint
ALTER TABLE "sports_markets" ADD COLUMN "frozen_reason" text;--> statement-breakpoint
ALTER TABLE "sports_notifications" ADD CONSTRAINT "sports_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_notifications" ADD CONSTRAINT "sports_notifications_pick_id_sports_picks_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."sports_picks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sports_notifications_pick_kind_idx" ON "sports_notifications" USING btree ("pick_id","kind");--> statement-breakpoint
CREATE INDEX "sports_notifications_pending_idx" ON "sports_notifications" USING btree ("delivered_at");