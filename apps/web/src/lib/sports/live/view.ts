import { ageOf, freshnessOf } from "./freshness.ts"
import { hasDraw } from "../types.ts"
import { normalizeQuote, pairProbability, pairProbability3 } from "./quote.ts"
import { chooseLiveOdds } from "./reconcile.ts"
import type { Freshness, LiveSelection, LiveSource, LiveStatus, NormalizedQuote, RawQuote, SourceProb } from "./types.ts"

/**
 * Assembles what the read API returns for one game from stored rows. Pure. Display only: this output never
 * feeds pick acceptance, payouts or settlement.
 */

export type QuoteRow = {
  market: string
  selection: string
  source: string
  bid: number | null
  ask: number | null
  mid: number | null
  sourceTs: Date | null
  fetchedTs: Date
}

export type StateRow = {
  status: string
  homeScore: number | null
  awayScore: number | null
  period: string | null
  clock: string | null
  source: string
  sourceTs: Date | null
  fetchedTs: Date
}

/** JSON-safe, with ISO strings, as served. */
export type LiveView = {
  eventId: string
  /** The game phase as the live feed sees it. Settlement never reads this. */
  status: LiveStatus
  score: { home: number | null; away: number | null } | null
  period: string | null
  clock: string | null
  /** When the score/period/clock were read, and how old that is. Null before any state arrived. */
  stateAsOf: string | null
  stateFreshness: Freshness | null
  odds:
    | {
        status: "ok"
        homeProb: number
        awayProb: number
        /** Soccer only: the draw probability, with home + draw + away = 1. Null elsewhere. */
        drawProb: number | null
        source: LiveSource
        asOf: string
        ageMs: number
        freshness: "live" | "delayed"
        confidence: "high" | "medium" | "low"
        mismatch: { with: LiveSource; diff: number } | null
      }
    | { status: "paused"; reason: string; lastAsOf: string | null }
  serverTime: string
}

const SOURCES: readonly LiveSource[] = ["polymarket", "kalshi", "espn"]
const STATUSES: readonly LiveStatus[] = ["pre", "live", "final", "unknown"]

/** How far back a quote row is worth reading; anything older cannot be shown anyway. */
export const READ_WINDOW_MS = 10 * 60_000

export function buildLiveView(input: { eventId: string; eventStatus: string; sport?: string; quotes: QuoteRow[]; state: StateRow | null }, now: Date): LiveView {
  const threeWay = hasDraw(input.sport, "moneyline")
  const raws: RawQuote[] = input.quotes
    .filter((q) => q.market === "moneyline" && (q.selection === "home" || q.selection === "away" || (threeWay && q.selection === "draw")) && (SOURCES as readonly string[]).includes(q.source))
    .map((q) => ({
      source: q.source as LiveSource,
      selection: q.selection as LiveSelection,
      bid: q.bid,
      ask: q.ask,
      mid: q.source === "espn" ? q.mid : undefined,
      sourceTs: q.sourceTs,
      fetchedTs: q.fetchedTs,
    }))

  const views: SourceProb[] = []
  for (const source of SOURCES) {
    const forSource = raws.filter((r) => r.source === source)
    // Rows are expected newest first per key; take the first of each side.
    const side = (s: LiveSelection): NormalizedQuote | undefined => {
      const r = forSource.find((x) => x.selection === s)
      return r ? normalizeQuote(r, now) : undefined
    }
    const pair = threeWay ? pairProbability3(side("home"), side("draw"), side("away")) : pairProbability(side("home"), side("away"))
    if (pair) views.push({ ...pair, source })
  }

  const gameOver = input.eventStatus !== "scheduled" || input.state?.status === "final"
  const odds = chooseLiveOdds(views, { gameOver, threeWay })

  const st = input.state
  const stateAge = st ? ageOf(st.fetchedTs, now) : null
  const status = st && (STATUSES as readonly string[]).includes(st.status) ? (st.status as LiveStatus) : "unknown"
  return {
    eventId: input.eventId,
    status: input.eventStatus === "final" ? "final" : status,
    score: st && (st.homeScore != null || st.awayScore != null) ? { home: st.homeScore, away: st.awayScore } : null,
    period: st?.period ?? null,
    clock: st?.clock ?? null,
    stateAsOf: st ? st.fetchedTs.toISOString() : null,
    stateFreshness: stateAge == null ? null : freshnessOf(stateAge),
    odds:
      odds.status === "ok"
        ? { ...odds, asOf: odds.asOf.toISOString(), confidence: odds.confidence }
        : { status: "paused", reason: odds.reason, lastAsOf: odds.lastAsOf ? odds.lastAsOf.toISOString() : null },
    serverTime: now.toISOString(),
  }
}

/**
 * A cached view is older than when it was computed. `ageView` adds the time it sat in a cache (`lagMs`) to every age it
 * reports and re-derives freshness, so the served age is true as of the response, not as of the cache fill. A quote that
 * crosses the stale line while cached is paused rather than shown as live.
 */
export function ageView(view: LiveView, lagMs: number): LiveView {
  if (lagMs <= 0) return view
  const out: LiveView = { ...view, serverTime: new Date(Date.parse(view.serverTime) + lagMs).toISOString() }
  if (view.odds.status === "ok") {
    const ageMs = view.odds.ageMs + lagMs
    const f = freshnessOf(ageMs)
    out.odds = f === "stale" ? { status: "paused", reason: "stale", lastAsOf: view.odds.asOf } : { ...view.odds, ageMs, freshness: f }
  }
  if (view.stateAsOf) out.stateFreshness = freshnessOf(Date.parse(out.serverTime) - Date.parse(view.stateAsOf))
  return out
}
