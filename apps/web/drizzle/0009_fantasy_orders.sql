DO $$ BEGIN
	CREATE TYPE "public"."order_status" AS ENUM('pending', 'filled', 'cancelled', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fantasy_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"security_id" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"amount" numeric(20, 2),
	"shares" numeric(24, 8),
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"trade_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fantasy_orders" ADD CONSTRAINT "fantasy_orders_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fantasy_orders" ADD CONSTRAINT "fantasy_orders_member_id_fantasy_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fantasy_orders" ADD CONSTRAINT "fantasy_orders_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fantasy_orders" ADD CONSTRAINT "fantasy_orders_trade_id_fantasy_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."fantasy_trades"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fantasy_orders_status_created_idx" ON "fantasy_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fantasy_orders_member_idx" ON "fantasy_orders" USING btree ("member_id","status");
