import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
import { securities } from "../db/schema.ts"
import { captureOpensAt, latestStartedSession } from "./market-hours.ts"

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
 * A live price dated that same day counts as behind too: it is whatever the
 * last refresh before the close happened to catch, not the close itself.
 *
 * Kept free of the database client so the tests can import it.
 */
export type CatchUp = {
  expectedDate: string
  recheckBefore: Date
  /** A never-priced row keeps this shorter cutoff (default `recheckBefore`): a new import must recover quickly. */
  neverPricedRecheckBefore?: Date
  /**
   * The market is closed. A ticker that already holds the session's official close then never
   * qualifies on age alone (the `updated_at < cutoff` branch is dropped), so a settled ticker
   * stays out of every provider call until the next session.
   */
  marketClosed?: boolean
  /** Funds' NAV may be out (19:00 New York time on the session's day). Default true. */
  fundNavOpen?: boolean
}

/** Shared by candidate selection and the atomic close claim. */
export function closeClaimDue(catchUp: Pick<CatchUp, "recheckBefore" | "neverPricedRecheckBefore">) {
  return or(
    and(isNull(securities.closePriceAsOf), lt(securities.updatedAt, catchUp.neverPricedRecheckBefore ?? catchUp.recheckBefore)),
    and(isNotNull(securities.closePriceAsOf), lt(securities.updatedAt, catchUp.recheckBefore)),
  )
}

export function staleHeldSecurities(cutoff: Date, catchUp?: CatchUp) {
  const behind = catchUp
    ? and(
        or(
          isNull(securities.closePriceAsOf),
          lt(securities.closePriceAsOf, catchUp.expectedDate),
          and(eq(securities.closePriceAsOf, catchUp.expectedDate), eq(securities.closePriceFinal, false)),
        ),
        closeClaimDue(catchUp),
        catchUp.fundNavOpen === false ? sql`${securities.type} IS DISTINCT FROM 'mutual_fund'` : undefined,
      )
    : undefined
  return and(
    isNotNull(securities.marketTicker),
    catchUp?.marketClosed ? behind : or(lt(securities.updatedAt, cutoff), behind),
    // Draft picks of a round still in play count too: a league that only drafts holds no positions,
    // and without this its entry and exit prices would never move.
    sql`(EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = ${securities.id})
      OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = ${securities.id})
      OR EXISTS (SELECT 1 FROM fantasy_draft_picks d JOIN fantasy_rounds r ON r.id = d.round_id WHERE d.security_id = ${securities.id} AND r.status <> 'settled'))`,
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
        AND s.type IS DISTINCT FROM 'mutual_fund'
        AND s.updated_at < now() - make_interval(secs => ${maxAgeSeconds}::double precision)
        AND (EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = s.id)
          OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = s.id)
          OR EXISTS (SELECT 1 FROM fantasy_draft_picks d JOIN fantasy_rounds r ON r.id = d.round_id WHERE d.security_id = s.id AND r.status <> 'settled'))
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

/**
 * Whether the official-close catch-up has nothing to do and may skip every provider
 * call and the stale-row query. True only when the market is closed and no held
 * security is missing the last completed session's close: `unsettled` counts those
 * with no price, a price dated before that session, or a live price from it that no
 * official close has replaced. A new ticker has no price, so it always counts.
 */
export function canSkipCloseCheck({ marketOpen, unsettled }: { marketOpen: boolean; unsettled: number }): boolean {
  return !marketOpen && unsettled === 0
}

/** The instant the catch-up for `expectedDate` began: its close plus 30 minutes (1:30pm on an early-close day). */
function catchUpStart(expectedDate: string): number | null {
  const at = captureOpensAt(expectedDate).getTime()
  return Number.isNaN(at) ? null : at
}

/**
 * How long to leave a ticker alone after checking it for the close of `expectedDate`.
 * Right after the bell the close appears within minutes, so a ticker still missing it is
 * asked about every `earlyMinutes` for `windowMinutes`. Past that it is not coming soon:
 * a fund's NAV lands in the evening, an OTC or delisted ticker may never get one, and
 * asking every few minutes all night spends the providers' allowances for nothing. So it
 * is retried every `laterMinutes` until `overnightAfterMinutes` after the close, and every
 * `overnightMinutes` after that. `earlyMinutes` of 0 (a forced run) stays 0.
 */
export function catchUpRecheckMinutes(
  now: Date,
  expectedDate: string,
  { earlyMinutes, windowMinutes = 45, laterMinutes = 120, overnightAfterMinutes = 360, overnightMinutes = 360 }: { earlyMinutes: number; windowMinutes?: number; laterMinutes?: number; overnightAfterMinutes?: number; overnightMinutes?: number },
): number {
  if (earlyMinutes <= 0) return 0
  const start = catchUpStart(expectedDate)
  const since = start === null ? Infinity : Math.max(0, (now.getTime() - start) / 60_000)
  if (since < windowMinutes) return earlyMinutes
  return Math.max(earlyMinutes, since < overnightAfterMinutes ? laterMinutes : overnightMinutes)
}

/**
 * The recheck spacing for `now`. The 45 min / 2 h / 6 h back-off applies only after the close:
 * the market is closed and the latest session that started is the one being caught up. While
 * the market is open, or between the bell and the capture time, `earlyMinutes` stays.
 */
export function closeRecheckMinutes(now: Date, expectedDate: string, { marketOpen, earlyMinutes }: { marketOpen: boolean; earlyMinutes: number }): number {
  if (marketOpen || latestStartedSession(now) !== expectedDate) return earlyMinutes
  return catchUpRecheckMinutes(now, expectedDate, { earlyMinutes })
}

/** Funds publish their NAV in the evening; before this New York time on the session's own day, asking is pointless. */
const FUND_NAV_PUBLISH_MINUTE = 19 * 60

/** Whether the NAV for the session `expectedDate` may be out yet: not while that same New York day is still before 7pm. */
export function fundNavMayBePublished(now: Date, expectedDate: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  const today = `${get("year")}-${get("month")}-${get("day")}`
  return today !== expectedDate || Number(get("hour")) * 60 + Number(get("minute")) >= FUND_NAV_PUBLISH_MINUTE
}

/**
 * Held securities still lacking the official close of `expectedDate`; one indexed-ish count.
 * `n` is all of them, `due` the ones the catch-up may ask about now (not checked since
 * `recheckBefore`, and not a fund before its NAV window). A ticker no source can settle stays
 * in `n` forever but is only `due` every few hours, so it can't keep the catch-up running
 * every few minutes. Without cutoffs everything is due.
 */
export function unsettledHeldSql(expectedDate: string, due?: { recheckBefore: Date; neverPricedRecheckBefore?: Date; fundNavOpen?: boolean }) {
  const isDue = due
    ? sql`(s.updated_at < (CASE WHEN s.close_price_as_of IS NULL THEN ${(due.neverPricedRecheckBefore ?? due.recheckBefore).toISOString()} ELSE ${due.recheckBefore.toISOString()} END)::timestamptz AND ${due.fundNavOpen === false ? sql`s.type IS DISTINCT FROM 'mutual_fund'` : sql`true`})`
    : sql`true`
  return sql`
    SELECT count(*)::int AS n, (count(*) FILTER (WHERE ${isDue}))::int AS due FROM securities s
    WHERE s.market_ticker IS NOT NULL
      AND (s.close_price_as_of IS NULL
        OR s.close_price_as_of < ${expectedDate}::date
        OR (s.close_price_as_of = ${expectedDate}::date AND NOT s.close_price_final))
      AND (EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = s.id)
        OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = s.id)
        OR EXISTS (SELECT 1 FROM fantasy_draft_picks d JOIN fantasy_rounds r ON r.id = d.round_id WHERE d.security_id = s.id AND r.status <> 'settled'))`
}

/**
 * Whether a live refresh result means the live source is broken: it claimed tickers that were
 * eligible for a live quote and got none. Funds in the claim (`funds`) are skipped on purpose,
 * make no request, and so never count against it.
 */
export function liveRefreshBroken(live: object): boolean {
  if ("error" in live) return true
  const { claimed = 0, funds = 0, refreshed = 0 } = live as { claimed?: number; funds?: number; refreshed?: number }
  return claimed - funds > 0 && refreshed === 0
}
