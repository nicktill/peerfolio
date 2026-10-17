CREATE TABLE "sports_rate_limits" (
	"key" text NOT NULL,
	"bucket" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sports_rate_limits_key_bucket_pk" PRIMARY KEY("key","bucket")
);
