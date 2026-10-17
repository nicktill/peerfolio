/**
 * Types for the live (in-game) odds layer. Plain data, no imports, so pure modules and
 * tests load them directly under node's type stripping.
 *
 * This layer is DISPLAY ONLY. Nothing here is read by pick acceptance, payout or
 * settlement: an accepted pick keeps its accepted price forever, and results come
 * from the independent results feeds, never from an exchange quote.
 */

export type LiveSource = "polymarket" | "kalshi" | "espn"
export type LiveSelection = "home" | "away"

/** Order of trust when sources agree enough to use: an order book beats a model. */
export const SOURCE_PRIORITY: readonly LiveSource[] = ["polymarket", "kalshi", "espn"]

/** What a source reported, before any judgement. Probabilities are 0..1. */
export type RawQuote = {
  source: LiveSource
  selection: LiveSelection
  /** Best bid and best ask of an order book. Null when that side of the book is empty. */
  bid: number | null
  ask: number | null
  /** Only for sources that publish a single number (a model), never for exchanges. */
  mid?: number | null
  /** Shares resting at the best bid / best ask, when the source reports sizes (Polymarket CLOB does). */
  bidSize?: number | null
  askSize?: number | null
  /** When the source says the book was true (e.g. the CLOB book timestamp). Null when it gives none. */
  sourceTs: Date | null
  /** When we read it. */
  fetchedTs: Date
}

export type Confidence = "high" | "medium" | "low" | "none"

export type NormalizedQuote = {
  source: LiveSource
  selection: LiveSelection
  bid: number | null
  ask: number | null
  /** (bid + ask) / 2 of a sane two-sided book; null otherwise. Never a last-trade price. */
  mid: number | null
  spread: number | null
  /** The time the quote is as-of: the OLDER of source and fetch time, so a stale book never looks fresh. */
  asOf: Date
  ageMs: number
  confidence: Confidence
  /** Why the quote has no usable mid, if it has none. */
  reason: string | null
}

export type Freshness = "live" | "delayed" | "stale"

/** One source's view of P(home wins), after pairing the two outcome books. */
export type SourceProb = {
  source: LiveSource
  homeProb: number
  asOf: Date
  ageMs: number
  spread: number | null
  confidence: Confidence
  freshness: Freshness
}

export type LiveStatus = "pre" | "live" | "final" | "unknown"

/** Score/period/clock of a game from one feed. Scores are oriented to OUR home/away. */
export type LiveGameState = {
  status: LiveStatus
  homeScore: number | null
  awayScore: number | null
  /** Display text as the feed gave it: "Q3", "End P1", "2H". */
  period: string | null
  /** Display clock, e.g. "05:12". */
  clock: string | null
  source: LiveSource
  sourceTs: Date | null
  fetchedTs: Date
}

/** What the read API and the UI consume. */
export type LiveOdds =
  | {
      status: "ok"
      homeProb: number
      awayProb: number
      source: LiveSource
      asOf: Date
      ageMs: number
      freshness: "live" | "delayed"
      confidence: Exclude<Confidence, "none">
      /** Set when a second source disagreed beyond the warn threshold. */
      mismatch: { with: LiveSource; diff: number } | null
    }
  | {
      status: "paused"
      reason: "no_quote" | "stale" | "sources_disagree" | "wide_spread" | "game_over"
      /** The newest quote time seen, if any, so the UI can say how long it has been. */
      lastAsOf: Date | null
    }
