ALTER TABLE "securities" ADD COLUMN "close_price_final" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Prices stored before this column existed may be live prices from the session (today's
-- were a 3pm print). Mark recent stock prices unconfirmed so the catch-up checks each
-- against the official close once; crypto and mutual funds never had live prices.
UPDATE "securities" SET "close_price_final" = false WHERE "market_ticker" IS NOT NULL AND "market_ticker" NOT LIKE 'X:%' AND "type" IS DISTINCT FROM 'mutual_fund' AND "close_price_as_of" >= CURRENT_DATE - 3;
