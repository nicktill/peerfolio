import { and, isNotNull, lt, sql } from "drizzle-orm"
import { securities } from "../db/schema.ts"

/**
 * Securities someone holds (a real position or a fantasy pick) whose price
 * hasn't been checked since `cutoff`.
 *
 * The cutoff goes through `lt()` on the column rather than a raw `sql` template:
 * a bare `Date` interpolated into `sql` reaches the driver unserialised and the
 * whole query fails. That took the first production refresh down silently, so
 * the test builds this exact clause and checks what would be sent.
 *
 * Kept free of the database client so the tests can import it.
 */
export function staleHeldSecurities(cutoff: Date) {
  return and(
    isNotNull(securities.marketTicker),
    lt(securities.updatedAt, cutoff),
    sql`(EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = ${securities.id})
      OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = ${securities.id}))`,
  )
}

/**
 * Claims the stock tickers that need a live price, atomically.
 *
 * Bumping `updated_at` in the same statement that selects them means that when
 * a hundred people open the app in the same minute, one request claims each
 * ticker and the rest get nothing to do: the provider is called once per
 * ticker per interval no matter how many users there are. `SKIP LOCKED` stops
 * two servers claiming the same row. Oldest first, capped at `limit`, so a
 * small provider budget is spread fairly. Crypto is excluded (daily close only).
 *
 * Numbers only in the parameters: a raw `Date` here would fail the query.
 */
export function claimLiveQuotesSql(maxAgeSeconds: number, limit: number) {
  return sql`
    UPDATE securities
    SET updated_at = now()
    WHERE id IN (
      SELECT s.id FROM securities s
      WHERE s.market_ticker IS NOT NULL
        AND s.market_ticker NOT LIKE 'X:%'
        AND s.updated_at < now() - make_interval(secs => ${maxAgeSeconds}::double precision)
        AND (EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = s.id)
          OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = s.id))
      ORDER BY s.updated_at ASC
      LIMIT ${limit}::int
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, market_ticker, close_price_as_of::text AS close_price_as_of`
}
