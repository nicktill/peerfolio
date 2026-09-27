CREATE TYPE "public"."trade_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TABLE "fantasy_leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '🏈' NOT NULL,
	"accent" text DEFAULT 'emerald' NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_code" text NOT NULL,
	"starting_cash" numeric(20, 2) DEFAULT '100000' NOT NULL,
	"max_position_pct" integer,
	"ends_at" timestamp with time zone,
	"member_limit" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cash" numeric(20, 6) NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"security_id" text NOT NULL,
	"shares" numeric(24, 8) NOT NULL,
	"cost_basis" numeric(20, 6) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"date" date NOT NULL,
	"value" numeric(20, 6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"security_id" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"shares" numeric(24, 8) NOT NULL,
	"price" numeric(20, 6) NOT NULL,
	"price_as_of" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_leagues" ADD CONSTRAINT "fantasy_leagues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_members" ADD CONSTRAINT "fantasy_members_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_members" ADD CONSTRAINT "fantasy_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_positions" ADD CONSTRAINT "fantasy_positions_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_positions" ADD CONSTRAINT "fantasy_positions_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_snapshots" ADD CONSTRAINT "fantasy_snapshots_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_trades" ADD CONSTRAINT "fantasy_trades_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_trades" ADD CONSTRAINT "fantasy_trades_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_trades" ADD CONSTRAINT "fantasy_trades_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_leagues_invite_code_idx" ON "fantasy_leagues" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "fantasy_leagues_owner_idx" ON "fantasy_leagues" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_members_unique_idx" ON "fantasy_members" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "fantasy_members_user_idx" ON "fantasy_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_positions_unique_idx" ON "fantasy_positions" USING btree ("member_id","security_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_snapshots_member_date_idx" ON "fantasy_snapshots" USING btree ("member_id","date");--> statement-breakpoint
CREATE INDEX "fantasy_trades_league_created_idx" ON "fantasy_trades" USING btree ("league_id","created_at");