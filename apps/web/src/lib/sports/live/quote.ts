import { ageOf, freshnessOf } from "./freshness.ts"
import type { Confidence, NormalizedQuote, RawQuote, SourceProb } from "./types.ts"

/** Spread (ask - bid) bands for an order book, in probability points. Wider books say less. */
export const SPREAD_HIGH = 0.03
export const SPREAD_MEDIUM = 0.08
export const SPREAD_LOW = 0.2

const valid = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1

const RANK: Record<Confidence, number> = { none: 0, low: 1, medium: 2, high: 3 }
export const minConfidence = (a: Confidence, b: Confidence): Confidence => (RANK[a] <= RANK[b] ? a : b)

/**
 * Turns one raw book into a judged quote. The mid is the midpoint of the best bid and best ask, and only of a
 * two-sided, uncrossed book: a last-trade price is never used, and one-sided or crossed books give no mid at all.
 */
export function normalizeQuote(raw: RawQuote, now: Date): NormalizedQuote {
  // The older of the two stamps: a book that is old at the source is old, however recently we asked.
  const asOf = raw.sourceTs && raw.sourceTs.getTime() < raw.fetchedTs.getTime() ? raw.sourceTs : raw.fetchedTs
  const ageMs = ageOf(asOf, now)
  const base = { source: raw.source, selection: raw.selection, bid: raw.bid, ask: raw.ask, asOf, ageMs }

  // Model feeds (ESPN) give one number and no book.
  if (raw.mid != null) {
    if (!valid(raw.mid) || raw.mid <= 0 || raw.mid >= 1) return { ...base, mid: null, spread: null, confidence: "none", reason: "invalid mid" }
    return { ...base, mid: raw.mid, spread: null, confidence: freshnessOf(ageMs) === "stale" ? "none" : "medium", reason: null }
  }
  if (!valid(raw.bid) || !valid(raw.ask)) return { ...base, mid: null, spread: null, confidence: "none", reason: "one-sided book" }
  if (raw.bid > raw.ask) return { ...base, mid: null, spread: null, confidence: "none", reason: "crossed book" }
  // A 0/1 edge is a resolved or empty market, not a probability someone is showing.
  if (raw.ask <= 0 || raw.bid >= 1) return { ...base, mid: null, spread: null, confidence: "none", reason: "resolved or empty book" }

  const spread = raw.ask - raw.bid
  const mid = (raw.bid + raw.ask) / 2
  let confidence: Confidence = spread <= SPREAD_HIGH ? "high" : spread <= SPREAD_MEDIUM ? "medium" : spread <= SPREAD_LOW ? "low" : "none"
  const fresh = freshnessOf(ageMs)
  if (fresh === "stale") confidence = "none"
  else if (fresh === "delayed") confidence = minConfidence(confidence, "medium")
  return { ...base, mid, spread, confidence, reason: confidence === "none" ? (fresh === "stale" ? "stale" : "spread too wide") : null }
}

/** The two outcome books of one binary game market should add to about 1; further out than this is not one market. */
export const MAX_OVERROUND = 0.1

/**
 * Pairs the home and away quotes of one source into P(home wins). With both mids the pair is renormalised to sum
 * to 1; with one it is the mid or its complement. Returns null when nothing usable. Confidence is the weaker
 * of the two, age is the older, spread is the wider. Unusable (stale or wide) books pair too but carry "none".
 */
export function pairProbability(home: NormalizedQuote | undefined, away: NormalizedQuote | undefined): SourceProb | null {
  // A stale or too-wide book still pairs (with confidence "none" / freshness "stale") so the reader can say WHY odds are paused.
  const h = home && home.mid != null ? home : null
  const a = away && away.mid != null ? away : null
  if (!h && !a) return null
  let homeProb: number
  let confidence: Confidence
  if (h && a) {
    const sum = h.mid! + a.mid!
    if (Math.abs(sum - 1) > MAX_OVERROUND) return null
    homeProb = h.mid! / sum
    confidence = minConfidence(h.confidence, a.confidence)
  } else if (h) {
    homeProb = h.mid!
    confidence = minConfidence(h.confidence, "medium")
  } else {
    homeProb = 1 - a!.mid!
    confidence = minConfidence(a!.confidence, "medium")
  }
  const parts = [h, a].filter((x): x is NormalizedQuote => x != null)
  const ageMs = Math.max(...parts.map((p) => p.ageMs))
  const asOf = parts.reduce((o, p) => (p.asOf.getTime() < o.getTime() ? p.asOf : o), parts[0]!.asOf)
  const spreads = parts.map((p) => p.spread).filter((s): s is number => s != null)
  return {
    source: parts[0]!.source,
    homeProb,
    asOf,
    ageMs,
    spread: spreads.length ? Math.max(...spreads) : null,
    confidence,
    freshness: freshnessOf(ageMs),
  }
}

/**
 * Three-way pairing for soccer: the home, draw and away YES books of ONE source become probabilities that sum to 1. All three
 * legs need a usable mid and the three mids must sum to within MAX_OVERROUND of 1 (otherwise they are not one market).
 * `homeProb` and `drawProb` are returned; the away probability is the remainder. Confidence is the weakest leg, age the oldest.
 */
export function pairProbability3(home: NormalizedQuote | undefined, draw: NormalizedQuote | undefined, away: NormalizedQuote | undefined): SourceProb | null {
  if (home?.mid == null || draw?.mid == null || away?.mid == null) return null
  const sum = home.mid + draw.mid + away.mid
  if (Math.abs(sum - 1) > MAX_OVERROUND) return null
  const parts = [home, draw, away]
  const ageMs = Math.max(...parts.map((p) => p.ageMs))
  const asOf = parts.reduce((o, p) => (p.asOf.getTime() < o.getTime() ? p.asOf : o), parts[0]!.asOf)
  const spreads = parts.map((p) => p.spread).filter((x): x is number => x != null)
  return {
    source: home.source,
    homeProb: home.mid / sum,
    drawProb: draw.mid / sum,
    asOf,
    ageMs,
    spread: spreads.length ? Math.max(...spreads) : null,
    confidence: parts.map((p) => p.confidence).reduce(minConfidence),
    freshness: freshnessOf(ageMs),
  }
}

/** Best bid and best ask of an unsorted list of levels (Polymarket returns bids ascending, asks descending). */
export function topOfBook(bids: { price: string | number }[], asks: { price: string | number }[]): { bid: number | null; ask: number | null } {
  const num = (l: { price: string | number }) => Number(l.price)
  const b = bids.map(num).filter((x) => Number.isFinite(x))
  const a = asks.map(num).filter((x) => Number.isFinite(x))
  return { bid: b.length ? Math.max(...b) : null, ask: a.length ? Math.min(...a) : null }
}

/** Best bid/ask with the total size resting at each best price (levels may arrive unsorted). */
export function topOfBookSized(
  bids: { price: string | number; size?: string | number }[],
  asks: { price: string | number; size?: string | number }[],
): { bid: number | null; ask: number | null; bidSize: number | null; askSize: number | null } {
  const best = (levels: typeof bids, pick: (a: number, b: number) => number) => {
    const priced = levels.map((l) => ({ p: Number(l.price), s: Number(l.size) })).filter((l) => Number.isFinite(l.p))
    if (!priced.length) return { price: null, size: null }
    const price = priced.map((l) => l.p).reduce((x, y) => pick(x, y))
    const sizes = priced.filter((l) => l.p === price).map((l) => l.s)
    return { price, size: sizes.every((x) => Number.isFinite(x)) ? sizes.reduce((a, b) => a + b, 0) : null }
  }
  const b = best(bids, Math.max)
  const a = best(asks, Math.min)
  return { bid: b.price, ask: a.price, bidSize: b.size, askSize: a.size }
}
