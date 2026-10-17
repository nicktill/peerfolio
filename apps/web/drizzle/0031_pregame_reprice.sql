CREATE TABLE "sports_line_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"line_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"price" integer NOT NULL,
	"point" double precision,
	"fair_prob" double precision,
	"source" text NOT NULL,
	"spread" double precision,
	"age_ms" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sports_lines" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_lines" ADD COLUMN "fair_prob" double precision;--> statement-breakpoint
ALTER TABLE "sports_lines" ADD COLUMN "repriced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_markets" ADD COLUMN "repriced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_markets" ADD COLUMN "reprice_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sports_markets" ADD COLUMN "exchange_ok_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sports_line_history" ADD CONSTRAINT "sports_line_history_line_id_sports_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."sports_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_line_history" ADD CONSTRAINT "sports_line_history_market_id_sports_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."sports_markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sports_line_history_market_idx" ON "sports_line_history" USING btree ("market_id","at");