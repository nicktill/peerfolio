CREATE TABLE "benchmark_prices" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"close" numeric(20, 6) NOT NULL,
	CONSTRAINT "benchmark_prices_symbol_date_pk" PRIMARY KEY("symbol","date")
);
