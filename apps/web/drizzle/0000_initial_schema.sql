CREATE TYPE "public"."account_category" AS ENUM('investment', 'cash', 'credit', 'loan', 'other');--> statement-breakpoint
CREATE TYPE "public"."account_source" AS ENUM('plaid', 'manual');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('active', 'needs_reauth', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid,
	"user_id" uuid NOT NULL,
	"source" "account_source" DEFAULT 'plaid' NOT NULL,
	"plaid_account_id" text,
	"institution_label" text,
	"name" text NOT NULL,
	"official_name" text,
	"mask" text,
	"type" text,
	"subtype" text,
	"category" "account_category" DEFAULT 'other' NOT NULL,
	"current_balance" numeric(20, 4),
	"available_balance" numeric(20, 4),
	"iso_currency_code" text DEFAULT 'USD',
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"security_id" text NOT NULL,
	"quantity" numeric(24, 8),
	"cost_basis" numeric(20, 4),
	"institution_value" numeric(20, 4),
	"iso_currency_code" text DEFAULT 'USD',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"share_holdings" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"emoji" text DEFAULT '🏆' NOT NULL,
	"accent" text DEFAULT 'emerald' NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_code" text NOT NULL,
	"member_limit" integer DEFAULT 25 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plaid_item_id" text NOT NULL,
	"access_token" text NOT NULL,
	"institution_id" text,
	"institution_name" text NOT NULL,
	"institution_logo" text,
	"status" "item_status" DEFAULT 'active' NOT NULL,
	"error_code" text,
	"transactions_cursor" text,
	"consent_expires_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"total_assets" numeric(20, 4) NOT NULL,
	"total_liabilities" numeric(20, 4) NOT NULL,
	"net_worth" numeric(20, 4) NOT NULL,
	"investable_assets" numeric(20, 4) NOT NULL,
	"net_flows" numeric(20, 4) DEFAULT '0' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "securities" (
	"id" text PRIMARY KEY NOT NULL,
	"ticker_symbol" text,
	"name" text,
	"type" text,
	"close_price" numeric(20, 6),
	"close_price_as_of" date,
	"iso_currency_code" text DEFAULT 'USD',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"handle" text,
	"bio" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"note" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_item_id_plaid_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD CONSTRAINT "plaid_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_plaid_id_idx" ON "accounts" USING btree ("plaid_account_id");--> statement-breakpoint
CREATE INDEX "accounts_source_idx" ON "accounts" USING btree ("user_id","source");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_item_idx" ON "accounts" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_unique_idx" ON "follows" USING btree ("follower_id","following_id");--> statement-breakpoint
CREATE INDEX "follows_following_idx" ON "follows" USING btree ("following_id");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_account_security_idx" ON "holdings" USING btree ("account_id","security_id");--> statement-breakpoint
CREATE INDEX "holdings_user_idx" ON "holdings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "league_members_unique_idx" ON "league_members" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "league_members_user_idx" ON "league_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_invite_code_idx" ON "leagues" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "leagues_owner_idx" ON "leagues" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plaid_items_item_id_idx" ON "plaid_items" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE INDEX "plaid_items_user_idx" ON "plaid_items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_user_date_idx" ON "portfolio_snapshots" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "snapshots_date_idx" ON "portfolio_snapshots" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_unique_idx" ON "reactions" USING btree ("league_id","from_user_id","to_user_id","emoji");--> statement-breakpoint
CREATE INDEX "reactions_league_target_idx" ON "reactions" USING btree ("league_id","to_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_idx" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_email_idx" ON "waitlist_signups" USING btree ("email");