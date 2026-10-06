CREATE TABLE "news_ai_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"period_end" date NOT NULL,
	"reserved_usd" numeric(10, 6) NOT NULL,
	"cost_usd" numeric(10, 6),
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "news_ai_spend_created_idx" ON "news_ai_spend" USING btree ("created_at");