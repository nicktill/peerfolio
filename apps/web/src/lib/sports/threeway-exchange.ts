import { REPRICE } from "./reprice-config.ts"
import type { Triple } from "./threeway.ts"

/**
 * Exchange side of the three-way moneyline: Polymarket lists three binary markets per game and Kalshi one market per outcome.
 * Each YES mid is a probability; the three mids sum to about 1 and are renormalised. The same gates as reprice.ts apply to EVERY
 * leg (spread, top size, read age, book timestamp age) plus a sum check, cross-source disagreement and the min fair probability.
 * Gate failures "hold" (keep the current line; the caller's stale-freeze applies) except price-range problems, which "freeze".
 * Kept apart from threeway.ts so pricing and settlement never import exchange code.
 */

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


/* ---- from quotes ---- */

/** The least a quote needs to become a YES book: which outcome it is, the book's best levels and sizes, and its two clocks. */
export type LegQuote = { selection: string; bid: number | null; ask: number | null; bidSize?: number | null; askSize?: number | null; sourceTs: Date | null; fetchedTs: Date }

/**
 * The home, draw and away YES books of one source as `ThreeWayBooks`, or null unless all three legs are present. `sizeUnknownOk`:
 * Kalshi reports no sizes, so as the CROSS-CHECK its legs count as having the minimum size (the two-way `other` is not size-checked
 * either); as a primary their size stays unknown and the thin-book gate holds.
 */
export function booksFromQuotes(quotes: LegQuote[], now: Date, sizeUnknownOk: boolean): ThreeWayBooks | null {
  const leg = (selection: string): YesBook | null => {
    const r = quotes.find((x) => x.selection === selection)
    if (!r) return null
    const sizes = [r.bidSize, r.askSize]
    const sized = sizes.every((x): x is number => typeof x === "number" && Number.isFinite(x))
    return {
      bid: r.bid,
      ask: r.ask,
      topSize: sized ? Math.min(...(sizes as number[])) : sizeUnknownOk ? REPRICE.minTopSize : null,
      ageMs: Math.max(0, now.getTime() - r.fetchedTs.getTime()),
      bookTsAgeMs: r.sourceTs ? r.fetchedTs.getTime() - r.sourceTs.getTime() : null,
    }
  }
  const [home, draw, away] = [leg("home"), leg("draw"), leg("away")]
  return home && draw && away ? { home, draw, away } : null
}
