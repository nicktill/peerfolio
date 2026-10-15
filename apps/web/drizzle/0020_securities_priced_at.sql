ALTER TABLE "securities" ADD COLUMN "priced_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_security_priced_at() RETURNS trigger AS $$
BEGIN
	NEW.priced_at := now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
-- Fires when a price column is written (UPDATE OF fires for any column in the SET list, even to the same
-- value), so every code path that stores a price is covered, and a refresh that only claims the row is not.
CREATE TRIGGER "securities_priced_at_update" BEFORE UPDATE OF "close_price", "close_price_as_of" ON "securities" FOR EACH ROW EXECUTE FUNCTION set_security_priced_at();--> statement-breakpoint
CREATE TRIGGER "securities_priced_at_insert" BEFORE INSERT ON "securities" FOR EACH ROW WHEN (NEW.close_price IS NOT NULL) EXECUTE FUNCTION set_security_priced_at();
