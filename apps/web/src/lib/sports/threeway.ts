import { americanToProb, DEFAULT_CONSENSUS, HOUSE_MARGIN, median, tidyAgainstPlayer, type ConsensusOptions } from "./odds.ts"
import type { BookQuote } from "./types.ts"

/**
 * Three-way moneyline (soccer: home / draw / away). Pure functions, no imports of stores or exchange code.
 *
 * DESIGN
 *  - A three-way market is a "moneyline" kind with THREE lines, selections "home" | "draw" | "away" (lines.selection is a
 *    text column, so "draw" needs no migration). Order is fixed: [home, draw, away]; fair triples use the same order.
 *  - Consensus: only books quoting ALL THREE outcomes (same freshness rule as two-way) count. Each book is devigged
 *    proportionally (p_i / sum p), the per-outcome median is taken after dropping books further than outlierDistance from the
 *    median on any outcome, and the medians are renormalised to sum to exactly 1.
 *  - Pricing: each side's implied probability is fair + margin/3, so the three sum to 1 + margin (same 2% HOUSE_MARGIN as
 *    two-way). Prices round AGAINST the player (tidyAgainstPlayer, floor to a multiple of 5), so rounding can only shrink
 *    payouts and the book can never be arbed by taking all three sides. Any side rarer than minFairProb refuses the market.
 *  - Exchange mapping: see threeway-exchange.ts (not imported here, so pricing and grading carry no exchange code).
 *  - Grading: a draw is a normal outcome, never a push. Invalid scores or unknown selections void (refund). Postponed,
 *    cancelled and abandoned games never reach here: the settlement resolver voids them before grading, as for two-way.
 */

export type ThreeSelection = "home" | "draw" | "away"
export const THREE_SELECTIONS: readonly ThreeSelection[] = ["home", "draw", "away"]
export type Triple = [number, number, number]

export type ThreeWayQuotes = { home: BookQuote[]; draw: BookQuote[]; away: BookQuote[] }
export type ThreeWayConsensus = { fair: Triple; booksUsed: number }

const sum3 = (t: readonly number[]): number => t[0]! + t[1]! + t[2]!

/** Proportional devig of three American prices to fair probabilities summing to 1. */
export function devigThreeWay(home: number, draw: number, away: number): Triple {
  const p: Triple = [americanToProb(home), americanToProb(draw), americanToProb(away)]
  const s = sum3(p)
  return [p[0] / s, p[1] / s, p[2] / s]
}

/** Consensus fair triple from per-book quotes. Null when too few books agree (no line beats an inaccurate line). */
export function consensusThreeWay(q: ThreeWayQuotes, opts: ConsensusOptions = DEFAULT_CONSENSUS): ThreeWayConsensus | null {
  const fresh = (x: BookQuote) => !x.at || !opts.now || opts.now.getTime() - x.at.getTime() <= opts.maxQuoteAgeMs
  const ok = (x: BookQuote) => fresh(x) && Number.isFinite(x.price) && x.point == null
  const byDraw = new Map(q.draw.filter(ok).map((x) => [x.book, x]))
  const byAway = new Map(q.away.filter(ok).map((x) => [x.book, x]))
  const seen = new Set<string>()
  const books: Triple[] = []
  for (const h of q.home.filter(ok)) {
    if (seen.has(h.book)) continue
    seen.add(h.book)
    const d = byDraw.get(h.book)
    const a = byAway.get(h.book)
    if (d && a) books.push(devigThreeWay(h.price, d.price, a.price))
  }
  if (books.length < opts.minBooks) return null
  const med: Triple = [median(books.map((b) => b[0])), median(books.map((b) => b[1])), median(books.map((b) => b[2]))]
  const kept = books.filter((b) => b.every((v, i) => Math.abs(v - med[i]!) <= opts.outlierDistance))
  if (kept.length < opts.minBooks) return null
  const m: Triple = [median(kept.map((b) => b[0])), median(kept.map((b) => b[1])), median(kept.map((b) => b[2]))]
  const s = sum3(m)
  return { fair: [m[0] / s, m[1] / s, m[2] / s], booksUsed: kept.length }
}

export type ThreeWayPricing = { margin: number; minFairProb: number }
/** Draws are ~25-30% and longshot away sides ~10%; below 8% a stale price is too costly. */
export const DEFAULT_THREEWAY_PRICING: ThreeWayPricing = { margin: HOUSE_MARGIN, minFairProb: 0.08 }

const rawAmerican = (prob: number): number => (prob >= 0.5 ? -(prob / (1 - prob)) * 100 : ((1 - prob) / prob) * 100)

/** American prices [home, draw, away], each at fair + margin/3 implied, rounded against the player. Null if invalid or lopsided. */
export function priceThreeWay(fair: Triple, cfg: ThreeWayPricing = DEFAULT_THREEWAY_PRICING): Triple | null {
  if (!fair.every((p) => Number.isFinite(p) && p > 0 && p < 1)) return null
  if (Math.abs(sum3(fair) - 1) > 1e-6) return null
  if (fair.some((p) => p < cfg.minFairProb)) return null
  const share = cfg.margin / 3
  const out = fair.map((p) => tidyAgainstPlayer(rawAmerican(p + share)))
  if (out.some((x) => !Number.isFinite(x) || (x > -100 && x < 100))) return null
  return out as Triple
}

/* ---- grading ---- */

// Grading lives in settlement.ts (the money path); re-exported here for callers and tests.
export { gradeThreeWay } from "./settlement.ts"
