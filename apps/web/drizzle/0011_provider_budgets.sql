CREATE TABLE "provider_budgets" (
	"provider" text PRIMARY KEY NOT NULL,
	"tokens" double precision NOT NULL,
	"refilled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"last_granted" boolean DEFAULT true NOT NULL
);
