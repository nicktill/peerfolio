/**
 * How fresh each held ticker's price is, and what is going to happen next: a
 * pure function over what `securities` stores, so the tests can run it directly
 * and the admin page can explain a stale price instead of just showing it.
 *
 * The refresh rules it describes live elsewhere: live quotes every
 * `refreshSeconds` while the market is open (`live-quotes.ts`), the nightly
 * catch-up for official closes and mutual funds (`positions.ts`), and Plaid's
 * own sync for brokerage-priced holdings.
 */

import { isTradingSession, isUsMarketOpen, latestStartedSession, latestTradingSession } from "./market-hours.ts"

export type TickerStatus =
  /** Priced in the last few minutes while the market is open. */
  | "live"
  /** Has the price it should have right now (the last official close, or a fund's latest NAV). */
  | "current"
  /** Behind by about one session, which is normal until the next refresh or publish lands. */
  | "pending"
  /** Missing a close it should have by now, or no provider will quote it. */
  | "behind"
  /** Priced by the brokerage at each sync, not by us. */
  | "brokerage"

export type TickerInput = {
  marketTicker: string | null
  type: string | null
  /** The day the stored price is for, `YYYY-MM-DD`. */
  asOf: string | null
  /** Whether the stored price is the official close for `asOf` (false for a live quote). */
  final: boolean
  /** When a price was last written (any write, not the quote's own timestamp), or null for rows priced before that was recorded. */
  pricedAt: Date | null
  /** Bumped when a refresh is claimed; pushed a day ahead when a provider refuses the ticker (the live refresh then skips it until it's due). */
  updatedAt: Date
}

export type TickerState = {
  status: TickerStatus
  /** Short label for a badge: "Live", "Final close"... */
  label: string
  /** One or two sentences: what we are waiting for and what happens next. */
  plan: string
  /** When the next attempt is expected, or null when it isn't on a clock we know. */
  nextAttemptAt: string | null
}

const HOUR = 3_600_000

export const isCryptoTicker = (marketTicker: string) => marketTicker.startsWith("X:")

/** The first moment at or after `now` when the regular session is open. Steps in quarter hours, so the clock change takes care of itself. */
export function nextSessionOpen(now: Date): Date | null {
  const step = 15 * 60_000
  const start = Math.ceil(now.getTime() / step) * step
  for (let t = start; t <= start + 8 * 24 * HOUR; t += step) {
    if (isTradingSession(new Date(t))) return new Date(t)
  }
  return null
}

/** Weekdays from `from` up to `to`, i.e. sessions a price is behind (holidays are not subtracted). */
export function sessionsBehind(from: string, to: string): number {
  const end = Date.parse(`${to}T00:00:00Z`)
  let day = Date.parse(`${from}T00:00:00Z`)
  let n = 0
  while (day < end) {
    day += 86_400_000
    const dow = new Date(day).getUTCDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

export function describeTicker(t: TickerInput, now: Date, refreshSeconds: number): TickerState {
  if (!t.marketTicker) {
    return { status: "brokerage", label: "Brokerage", plan: "Priced by the brokerage and refreshed at each Plaid sync. We don't quote it ourselves.", nextAttemptAt: null }
  }

  if (isCryptoTicker(t.marketTicker)) {
    const behind = t.asOf ? sessionsBehind(t.asOf, now.toISOString().slice(0, 10)) : 99
    return behind <= 1
      ? { status: "current", label: "Daily close", plan: "Crypto has a daily close only. The nightly job updates it.", nextAttemptAt: null }
      : { status: "behind", label: "Behind", plan: "Crypto has a daily close only, and the nightly job hasn't refreshed this one lately.", nextAttemptAt: null }
  }

  const expected = latestTradingSession(now)
  const behindBy = t.asOf ? sessionsBehind(t.asOf, expected) : 99

  if (t.type === "mutual_fund") {
    if (behindBy <= 0) return { status: "current", label: "Latest NAV", plan: `Has the ${dayLabel(expected)} NAV. Tiingo publishes each day's NAV after the close.`, nextAttemptAt: null }
    if (behindBy === 1) return { status: "pending", label: "Awaiting NAV", plan: `Waiting for the ${dayLabel(expected)} NAV, which Tiingo posts after the close. The catch-up retries until it lands.`, nextAttemptAt: null }
    return { status: "behind", label: "Behind", plan: `Missing NAVs since ${t.asOf ? dayLabel(t.asOf) : "ever"}. The catch-up retries each run; check Tiingo if this persists.`, nextAttemptAt: null }
  }

  if (isUsMarketOpen(now)) {
    const parked = t.updatedAt.getTime() > now.getTime() + HOUR
    const next = new Date(Math.max(now.getTime(), t.updatedAt.getTime() + refreshSeconds * 1000))
    if (parked) {
      return {
        status: "behind",
        label: "Parked",
        plan: "A provider refused to quote this (or it's a fund), so it's set aside and asked again later. The nightly close still prices it.",
        nextAttemptAt: new Date(t.updatedAt.getTime() + refreshSeconds * 1000).toISOString(),
      }
    }
    // priced_at is the last price write, not the quote's own time. A write also happens when a trigger
    // rewrites yesterday's final close, so "live" needs the stored price to belong to the current session too.
    const today = latestStartedSession(now)
    const recentWrite = t.pricedAt != null && now.getTime() - t.pricedAt.getTime() <= Math.max(10 * 60_000, refreshSeconds * 3 * 1000)
    if (recentWrite && t.asOf != null && t.asOf >= today) {
      return { status: "live", label: "Live", plan: `Quoted every ${Math.round(refreshSeconds / 60)} min while the market is open.`, nextAttemptAt: next.toISOString() }
    }
    if (t.asOf && t.asOf >= today) {
      return { status: "pending", label: "Queued", plan: "Priced earlier today and waiting for its next live refresh.", nextAttemptAt: next.toISOString() }
    }
    return { status: "behind", label: "Behind", plan: "No live price yet today. It's in the refresh queue, and a provider failure or budget refusal would delay it a few minutes.", nextAttemptAt: next.toISOString() }
  }

  const open = nextSessionOpen(now)
  const opens = open ? "The next live price comes when the market opens." : ""
  if (behindBy <= 0 && t.final) {
    return { status: "current", label: "Final close", plan: `Has the official ${dayLabel(expected)} close. ${opens}`.trim(), nextAttemptAt: open?.toISOString() ?? null }
  }
  if (behindBy <= 0) {
    return { status: "pending", label: "Awaiting close", plan: `Has a live ${dayLabel(expected)} price. The official close lands in the catch-up after the bell.`, nextAttemptAt: null }
  }
  return {
    status: "behind",
    label: "Behind",
    plan: `Missing the ${dayLabel(expected)} close${t.asOf ? ` (last priced ${dayLabel(t.asOf)})` : ""}. The nightly catch-up retries it, usually from the previous-close lookup, which can trail by a day on our plan.`,
    nextAttemptAt: null,
  }
}

// ---------------------------------------------------------------------------
// What went wrong lately for a ticker, from the event log.
// ---------------------------------------------------------------------------

export type TickerEvent = { at: string; provider: string; kind: string; reason: string; symbols: string[] }

export type TickerIssues = {
  denied: number
  rateLimited: number
  failed: number
  last: { at: string; provider: string; kind: string; reason: string } | null
}

/** Groups `events` (newest first) by ticker for the `wanted` set. A ticker with none gets no entry. */
export function issuesByTicker(events: TickerEvent[], wanted: Set<string>): Map<string, TickerIssues> {
  const out = new Map<string, TickerIssues>()
  for (const e of events) {
    for (const symbol of e.symbols) {
      if (!wanted.has(symbol)) continue
      const issues = out.get(symbol) ?? { denied: 0, rateLimited: 0, failed: 0, last: null }
      if (e.kind === "denied") issues.denied++
      else if (e.kind === "rate_limited") issues.rateLimited++
      else issues.failed++
      issues.last ??= { at: e.at, provider: e.provider, kind: e.kind, reason: e.reason }
      out.set(symbol, issues)
    }
  }
  return out
}

export type TickerRow = {
  id: string
  /** What to show and look a logo up by: the display symbol. */
  symbol: string
  marketTicker: string | null
  name: string | null
  type: string | null
  price: number | null
  asOf: string | null
  final: boolean
  pricedAt: string | null
  holders: number
  fantasyHolders: number
  state: TickerState
  issues: TickerIssues | null
}

export type TickersResponse = {
  now: string
  refreshSeconds: number
  marketOpen: boolean
  nextOpen: string | null
  tickers: TickerRow[]
}
