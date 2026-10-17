CREATE TABLE "sports_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport" text NOT NULL,
	"external_id" text NOT NULL,
	"home_name" text NOT NULL,
	"away_name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"final_first_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '🏈' NOT NULL,
	"accent" text DEFAULT 'emerald' NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_code" text NOT NULL,
	"sports" jsonb NOT NULL,
	"starting_credits" integer DEFAULT 1000 NOT NULL,
	"ends_at" timestamp with time zone,
	"member_limit" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"member_id" uuid NOT NULL,
	"pick_id" uuid,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"selection" text NOT NULL,
	"price" integer NOT NULL,
	"point" double precision,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"market_key" text NOT NULL,
	"kind" text NOT NULL,
	"player" text,
	"stat_key" text,
	"status" text DEFAULT 'open' NOT NULL,
	"lock_at" timestamp with time zone NOT NULL,
	"books_used" integer NOT NULL,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"credits" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_members_credits_nonneg" CHECK ("sports_members"."credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sports_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"selection" text NOT NULL,
	"stake" integer NOT NULL,
	"price" integer NOT NULL,
	"point" double precision,
	"total_return" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"request_id" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "sports_picks_stake_pos" CHECK ("sports_picks"."stake" > 0)
);
--> statement-breakpoint
CREATE TABLE "sports_provider_usage" (
	"provider" text NOT NULL,
	"day" date NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sports_provider_usage_provider_day_pk" PRIMARY KEY("provider","day")
);
--> statement-breakpoint
ALTER TABLE "sports_leagues" ADD CONSTRAINT "sports_leagues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_ledger" ADD CONSTRAINT "sports_ledger_member_id_sports_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."sports_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_ledger" ADD CONSTRAINT "sports_ledger_pick_id_sports_picks_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."sports_picks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_lines" ADD CONSTRAINT "sports_lines_market_id_sports_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."sports_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_markets" ADD CONSTRAINT "sports_markets_event_id_sports_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."sports_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_members" ADD CONSTRAINT "sports_members_league_id_sports_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."sports_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_members" ADD CONSTRAINT "sports_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_picks" ADD CONSTRAINT "sports_picks_league_id_sports_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."sports_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_picks" ADD CONSTRAINT "sports_picks_member_id_sports_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."sports_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_picks" ADD CONSTRAINT "sports_picks_market_id_sports_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."sports_markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_picks" ADD CONSTRAINT "sports_picks_line_id_sports_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."sports_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sports_events_external_idx" ON "sports_events" USING btree ("sport","external_id");--> statement-breakpoint
CREATE INDEX "sports_events_starts_idx" ON "sports_events" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sports_leagues_invite_code_idx" ON "sports_leagues" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "sports_leagues_owner_idx" ON "sports_leagues" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sports_ledger_key_idx" ON "sports_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "sports_ledger_member_idx" ON "sports_ledger" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sports_lines_market_sel_idx" ON "sports_lines" USING btree ("market_id","selection");--> statement-breakpoint
CREATE UNIQUE INDEX "sports_markets_event_key_idx" ON "sports_markets" USING btree ("event_id","market_key");--> statement-breakpoint
CREATE INDEX "sports_markets_status_idx" ON "sports_markets" USING btree ("status","lock_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sports_members_unique_idx" ON "sports_members" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "sports_members_user_idx" ON "sports_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sports_picks_member_market_idx" ON "sports_picks" USING btree ("member_id","market_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sports_picks_request_idx" ON "sports_picks" USING btree ("member_id","request_id");--> statement-breakpoint
CREATE INDEX "sports_picks_market_idx" ON "sports_picks" USING btree ("market_id","status");