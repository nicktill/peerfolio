CREATE TABLE "sports_parlay_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parlay_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"selection" text NOT NULL,
	"price" integer NOT NULL,
	"point" double precision,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_parlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"stake" integer NOT NULL,
	"combined_decimal" double precision NOT NULL,
	"total_return" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"payout" integer,
	"request_id" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "sports_parlays_stake_pos" CHECK ("sports_parlays"."stake" > 0)
);
--> statement-breakpoint
ALTER TABLE "sports_parlay_legs" ADD CONSTRAINT "sports_parlay_legs_parlay_id_sports_parlays_id_fk" FOREIGN KEY ("parlay_id") REFERENCES "public"."sports_parlays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_parlay_legs" ADD CONSTRAINT "sports_parlay_legs_line_id_sports_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."sports_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_parlay_legs" ADD CONSTRAINT "sports_parlay_legs_market_id_sports_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."sports_markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_parlay_legs" ADD CONSTRAINT "sports_parlay_legs_event_id_sports_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sports_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_parlays" ADD CONSTRAINT "sports_parlays_league_id_sports_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."sports_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_parlays" ADD CONSTRAINT "sports_parlays_member_id_sports_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."sports_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sports_parlay_legs_event_idx" ON "sports_parlay_legs" USING btree ("parlay_id","event_id");--> statement-breakpoint
CREATE INDEX "sports_parlay_legs_market_idx" ON "sports_parlay_legs" USING btree ("market_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sports_parlays_request_idx" ON "sports_parlays" USING btree ("member_id","request_id");--> statement-breakpoint
CREATE INDEX "sports_parlays_league_idx" ON "sports_parlays" USING btree ("league_id","accepted_at");--> statement-breakpoint
CREATE INDEX "sports_parlays_member_idx" ON "sports_parlays" USING btree ("member_id","status");