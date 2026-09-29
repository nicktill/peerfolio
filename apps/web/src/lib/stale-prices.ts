import { and, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
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
 * `catchUp` adds a second way to qualify: the price is dated before the latest
 * trading day whose close should exist, and hasn't been checked since
 * `recheckBefore`. That's what lets a new official close be picked up within
 * minutes of it being published, instead of waiting out the whole cutoff.
 *
 * Kept free of the database client so the tests can import it.
 */
export function staleHeldSecurities(cutoff: Date, catchUp?: { expectedDate: string; recheckBefore: Date }) {
  const behind = catchUp
    ? and(or(isNull(securities.closePriceAsOf), lt(securities.closePriceAsOf, catchUp.expectedDate)), lt(securities.updatedAt, catchUp.recheckBefore))
    : undefined
  return and(
    isNotNull(securities.marketTicker),
    or(lt(securities.updatedAt, cutoff), behind),
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

/**
 * How many tickers this run may claim: what's left of the per-minute call
 * budget, capped per run. The budget is what keeps a burst of due tickers (the
 * market opening, the first visit after a quiet spell) from spending the
 * provider's per-minute limit in one go; the rest are picked up by the next
 * runs, so a big backlog drains over a few minutes instead.
 */
export function claimBudget({ recent, perMinute, maxPerRun }: { recent: number; perMinute: number; maxPerRun: number }): number {
  return Math.max(0, Math.min(maxPerRun, perMinute - recent))
}

/** Tickers claimed in the last `windowSeconds`, i.e. calls already spent in that window. */
export function recentClaimsSql(windowSeconds: number) {
  return sql`
    SELECT count(*)::int AS n FROM securities
    WHERE market_ticker IS NOT NULL
      AND updated_at > now() - make_interval(secs => ${windowSeconds}::double precision)`
}

/**
 * Puts claimed tickers that didn't get a price back in the queue: they become
 * due again in `retrySeconds`, instead of waiting out the whole refresh period
 * as if they had been refreshed. Only numbers and ids in the parameters.
 */
export function releaseClaimsSql(ids: string[], retrySeconds: number, periodSeconds: number) {
  return sql`
    UPDATE securities
    SET updated_at = now() - make_interval(secs => ${Math.max(0, periodSeconds - retrySeconds)}::double precision)
    WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
}
