import { americanToProb, DEFAULT_CONSENSUS, HOUSE_MARGIN, median, tidyAgainstPlayer, type ConsensusOptions } from "./odds.ts"
import { REPRICE } from "./reprice.ts"
import type { BookQuote, Outcome } from "./types.ts"

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
 *  - Exchange: Polymarket lists three binary markets per game and Kalshi one market per outcome. Each YES mid is a
 *    probability; the three mids sum to about 1 and are renormalised. The same gates as reprice.ts apply to EVERY leg
 *    (spread, top size, read age, book timestamp age) plus a sum check, cross-source disagreement and the min fair
 *    probability. Gate failures "hold" (keep the current line; the caller's stale-freeze applies) except price-range
 *    problems, which "freeze".
 *  - Grading: a draw is a normal outcome, never a push. Invalid scores or unknown selections void (refund). Postponed,
 *    cancelled and abandoned games never reach here: the settlement resolver voids them before grading, as for two-way.
 *  - Integration edits are listed in the hand-off report, not here; nothing else imports this file yet.
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

/* ---- exchange mapping ---- */

/** One binary YES book for one outcome of a three-way game. */
export type YesBook = {
  bid: number | null
  ask: number | null
  /** Size resting at the best bid and best ask (smallest of the two); null when the source reports none. */
  topSize: number | null
  ageMs: number
  bookTsAgeMs: number | null
}
export type ThreeWayBooks = { home: YesBook; draw: YesBook; away: YesBook }
export type ThreeWayExchangeInput = {
  source: "polymarket" | "kalshi"
  books: ThreeWayBooks
  /** The other exchange's books for the cross-check, if any. */
  other?: ThreeWayBooks | null
  gameLive: boolean
  acceptingOrders: boolean
}
export type ThreeWayExchangeView = { fair: Triple; spread: number; topSize: number; ageMs: number; source: "polymarket" | "kalshi"; other: { fair: Triple } | null }
export type ThreeWayExchangeResult = { ok: true; view: ThreeWayExchangeView } | { ok: false; action: "hold" | "freeze"; reason: string }

/** Max deviation of the three raw mids' sum from 1 before the books are called inconsistent. */
export const MAX_SUM_DEVIATION = 0.05

type Normalised = { fair: Triple } | { reason: string; action: "hold" | "freeze" }
function normalise(b: ThreeWayBooks, label: string): (Normalised & { spread?: number; topSize?: number; ageMs?: number }) {
  const legs = [b.home, b.draw, b.away]
  let spread = 0
  let topSize = Infinity
  let ageMs = 0
  const mids: number[] = []
  for (const l of legs) {
    if (l.bid == null || l.ask == null || !(l.bid >= 0 && l.ask <= 1 && l.ask >= l.bid)) return { action: "hold", reason: `${label} invalid price` }
    const mid = (l.bid + l.ask) / 2
    if (!(mid > 0 && mid < 1)) return { action: "hold", reason: `${label} invalid price` }
    if (l.ageMs > REPRICE.maxAgeMs) return { action: "hold", reason: `${label} read too old` }
    if (l.bookTsAgeMs != null && l.bookTsAgeMs > REPRICE.maxBookTsAgeMs) return { action: "hold", reason: `${label} book timestamp stuck` }
    if (l.ask - l.bid > REPRICE.maxSpread) return { action: "hold", reason: `${label} book too wide` }
    if (l.topSize == null || l.topSize < REPRICE.minTopSize) return { action: "hold", reason: `${label} book too thin` }
    spread = Math.max(spread, l.ask - l.bid)
    topSize = Math.min(topSize, l.topSize)
    ageMs = Math.max(ageMs, l.ageMs)
    mids.push(mid)
  }
  const s = mids[0]! + mids[1]! + mids[2]!
  if (Math.abs(s - 1) > MAX_SUM_DEVIATION) return { action: "hold", reason: `${label} outcomes do not sum to 1` }
  return { fair: [mids[0]! / s, mids[1]! / s, mids[2]! / s], spread, topSize, ageMs }
}

/**
 * Three YES mids -> a normalised fair triple, or why not. Same gates as decideReprice (decideReprice stays the owner of
 * step/hour/min-interval logic; generalise its probA to a triple and feed it `view.fair`).
 */
export function exchangeThreeWay(x: ThreeWayExchangeInput): ThreeWayExchangeResult {
  if (x.gameLive) return { ok: false, action: "freeze", reason: "exchange shows the game in play before its scheduled start" }
  if (!x.acceptingOrders) return { ok: false, action: "hold", reason: "not accepting orders" }
  const n = normalise(x.books, x.source)
  if (!("fair" in n)) return { ok: false, action: n.action, reason: n.reason }
  let other: { fair: Triple } | null = null
  if (x.other) {
    const o = normalise(x.other, "other source")
    // An unusable second source is no cross-check, same as reprice.ts where `other` is simply absent.
    if ("fair" in o) {
      if (o.fair.some((v, i) => Math.abs(v - n.fair[i]!) > REPRICE.disagree)) return { ok: false, action: "hold", reason: "sources disagree" }
      other = { fair: o.fair }
    }
  }
  if (n.fair.some((v) => v < REPRICE.minFair / 2 || v > 1 - REPRICE.minFair)) return { ok: false, action: "freeze", reason: "price outside the repricing range" }
  return { ok: true, view: { fair: n.fair, spread: n.spread!, topSize: n.topSize!, ageMs: n.ageMs!, source: x.source, other } }
}

/* ---- grading ---- */

const validScore = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0

/** Final-score grading. Draw is a real outcome (never a push). Invalid scores or selection: void (refund). */
export function gradeThreeWay(selection: string, homeScore: number | null, awayScore: number | null): Outcome {
  if (!validScore(homeScore) || !validScore(awayScore)) return "void"
  if (selection !== "home" && selection !== "draw" && selection !== "away") return "void"
  const result: ThreeSelection = homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw"
  return result === selection ? "win" : "loss"
}
