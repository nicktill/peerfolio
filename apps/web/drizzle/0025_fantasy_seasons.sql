CREATE TABLE "fantasy_draft_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"security_id" text NOT NULL,
	"slot" integer NOT NULL,
	"entry_price" numeric(20, 6),
	"entry_as_of" date,
	"exit_price" numeric(20, 6),
	"exit_as_of" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fantasy_note_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_note_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"trade_id" uuid,
	"order_id" uuid,
	"pick_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_recaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"share_token" text NOT NULL,
	"sharing" boolean DEFAULT true NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_round_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"return_pct" numeric(14, 4) NOT NULL,
	"floor_pct" numeric(14, 4),
	"rank" integer NOT NULL,
	"points" numeric(8, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"league_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"mode" text DEFAULT 'trading' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"round_count" integer,
	"picks_per_round" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_trophies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"round_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_draft_picks" ADD CONSTRAINT "fantasy_draft_picks_round_id_fantasy_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."fantasy_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_draft_picks" ADD CONSTRAINT "fantasy_draft_picks_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_draft_picks" ADD CONSTRAINT "fantasy_draft_picks_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_events" ADD CONSTRAINT "fantasy_events_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_events" ADD CONSTRAINT "fantasy_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_note_reactions" ADD CONSTRAINT "fantasy_note_reactions_note_id_fantasy_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."fantasy_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_note_reactions" ADD CONSTRAINT "fantasy_note_reactions_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_note_replies" ADD CONSTRAINT "fantasy_note_replies_note_id_fantasy_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."fantasy_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_note_replies" ADD CONSTRAINT "fantasy_note_replies_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_notes" ADD CONSTRAINT "fantasy_notes_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_notes" ADD CONSTRAINT "fantasy_notes_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_notes" ADD CONSTRAINT "fantasy_notes_trade_id_fantasy_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."fantasy_trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_notes" ADD CONSTRAINT "fantasy_notes_order_id_fantasy_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."fantasy_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_notes" ADD CONSTRAINT "fantasy_notes_pick_id_fantasy_draft_picks_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."fantasy_draft_picks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_recaps" ADD CONSTRAINT "fantasy_recaps_round_id_fantasy_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."fantasy_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_recaps" ADD CONSTRAINT "fantasy_recaps_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_round_results" ADD CONSTRAINT "fantasy_round_results_round_id_fantasy_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."fantasy_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_round_results" ADD CONSTRAINT "fantasy_round_results_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_round_results" ADD CONSTRAINT "fantasy_round_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_rounds" ADD CONSTRAINT "fantasy_rounds_season_id_fantasy_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."fantasy_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_rounds" ADD CONSTRAINT "fantasy_rounds_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_seasons" ADD CONSTRAINT "fantasy_seasons_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_trophies" ADD CONSTRAINT "fantasy_trophies_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_trophies" ADD CONSTRAINT "fantasy_trophies_season_id_fantasy_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."fantasy_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_trophies" ADD CONSTRAINT "fantasy_trophies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_draft_picks_unique_idx" ON "fantasy_draft_picks" USING btree ("round_id","member_id","security_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_draft_picks_slot_idx" ON "fantasy_draft_picks" USING btree ("round_id","member_id","slot");--> statement-breakpoint
CREATE INDEX "fantasy_draft_picks_round_idx" ON "fantasy_draft_picks" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_events_dedupe_idx" ON "fantasy_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "fantasy_events_user_idx" ON "fantasy_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_note_reactions_unique_idx" ON "fantasy_note_reactions" USING btree ("note_id","member_id","emoji");--> statement-breakpoint
CREATE INDEX "fantasy_note_replies_note_idx" ON "fantasy_note_replies" USING btree ("note_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_notes_trade_idx" ON "fantasy_notes" USING btree ("trade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_notes_order_idx" ON "fantasy_notes" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_notes_pick_idx" ON "fantasy_notes" USING btree ("pick_id");--> statement-breakpoint
CREATE INDEX "fantasy_notes_league_idx" ON "fantasy_notes" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_recaps_round_idx" ON "fantasy_recaps" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_recaps_token_idx" ON "fantasy_recaps" USING btree ("share_token");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_round_results_unique_idx" ON "fantasy_round_results" USING btree ("round_id","member_id");--> statement-breakpoint
CREATE INDEX "fantasy_round_results_user_idx" ON "fantasy_round_results" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_rounds_season_number_idx" ON "fantasy_rounds" USING btree ("season_id","number");--> statement-breakpoint
CREATE INDEX "fantasy_rounds_league_idx" ON "fantasy_rounds" USING btree ("league_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_seasons_league_number_idx" ON "fantasy_seasons" USING btree ("league_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_trophies_unique_idx" ON "fantasy_trophies" USING btree ("season_id","user_id","kind","round_number");--> statement-breakpoint
CREATE INDEX "fantasy_trophies_user_idx" ON "fantasy_trophies" USING btree ("user_id");