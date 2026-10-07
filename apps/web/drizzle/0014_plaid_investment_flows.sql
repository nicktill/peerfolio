CREATE TABLE "plaid_investment_flows" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"baseline" boolean DEFAULT false NOT NULL,
	"transaction_date" date,
	"account_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plaid_baseline_date" date;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "flows_initialized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plaid_investment_flows" ADD CONSTRAINT "plaid_investment_flows_item_id_plaid_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plaid_investment_flows_item_idx" ON "plaid_investment_flows" USING btree ("item_id");