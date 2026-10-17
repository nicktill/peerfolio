import type { BookQuote } from "./types.ts"

/**
 * Odds maths and the consensus line.
 *
 * We never show a single book's price. For each market we strip each book's
 * margin (devig), take the median fair probability across books after dropping
 * outliers, and then price the contest with one fixed margin of our own. So a
 * random player loses a little on average and no book's stale price is
 * copyable.
 */

export const americanToDecimal = (american: number): number =>
  american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american)

export const americanToProb = (american: number): number => 1 / americanToDecimal(american)

export function probToAmerican(prob: number): number {
  if (!(prob > 0 && prob < 1)) throw new RangeError("probability must be between 0 and 1")
  const raw = prob >= 0.5 ? -(prob / (1 - prob)) * 100 : ((1 - prob) / prob) * 100
  return Math.round(raw)
}

/** Round to the nearest 5 so lines look like real lines (-110, +145). Never returns -99..+99. */
export function tidyAmerican(american: number): number {
  const rounded = Math.round(american / 5) * 5
  if (rounded > -100 && rounded < 100) return rounded < 0 ? -100 : 100
  return rounded
}

/** Proportional devig of a two-way market. Returns the fair probability of side A. */
export function devigTwoWay(a: number, b: number): number {
  const pa = americanToProb(a)
  const pb = americanToProb(b)
  return pa / (pa + pb)
}

export const median = (values: number[]): number => {
  if (values.length === 0) throw new RangeError("median of nothing")
  const s = [...values].sort((x, y) => x - y)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export type Consensus = {
  /** Fair probability of side A (the first outcome). */
  fairProbA: number
  /** The point both sides are quoted at, or null for moneylines. */
  point: number | null
  booksUsed: number
}

export type ConsensusOptions = {
  /** Drop a book quote last updated longer ago than this (only when the quote carries a timestamp). */
  maxQuoteAgeMs: number
  /** Reference time for quote age. */
  now?: Date
  minBooks: number
  /** Drop a book whose fair prob is further than this from the median. */
  outlierDistance: number
}

export const DEFAULT_CONSENSUS: ConsensusOptions = { minBooks: 3, outlierDistance: 0.06, maxQuoteAgeMs: 15 * 60_000 }

/**
 * Builds the consensus for a two-way market. `sideA` and `sideB` are the
 * quotes for each side; for spreads side A's point is the negative of side B's,
 * so `sideBPointSign` flips B before comparing. Only books quoting BOTH sides
 * at the modal point count. Returns null when too few books agree: no line is
 * better than an inaccurate line.
 */
export function consensusTwoWay(
  sideA: BookQuote[],
  sideB: BookQuote[],
  opts: ConsensusOptions = DEFAULT_CONSENSUS,
  sideBPointSign: 1 | -1 = 1,
): Consensus | null {
  const fresh = (q: BookQuote) => !q.at || !opts.now || opts.now.getTime() - q.at.getTime() <= opts.maxQuoteAgeMs
  const byBookB = new Map(sideB.filter(fresh).map((q) => [q.book, q]))
  const pairs = sideA.filter(fresh).flatMap((a) => {
    const b = byBookB.get(a.book)
    if (!b) return []
    if (!Number.isFinite(a.price) || !Number.isFinite(b.price)) return []
    if (a.point == null !== (b.point == null)) return []
    if (a.point != null && b.point != null && a.point !== b.point * sideBPointSign) return []
    return [{ point: a.point, fair: devigTwoWay(a.price, b.price) }]
  })

  // Modal point: the line most books agree on. Ties go to the point closest to the median point.
  const counts = new Map<number | null, number>()
  for (const p of pairs) counts.set(p.point, (counts.get(p.point) ?? 0) + 1)
  if (counts.size === 0) return null
  const points = pairs.map((p) => p.point).filter((p): p is number => p != null)
  const medPoint = points.length ? median(points) : null
  const modal = [...counts.entries()].sort((x, y) => {
    if (y[1] !== x[1]) return y[1] - x[1]
    if (medPoint == null || x[0] == null || y[0] == null) return 0
    return Math.abs(x[0] - medPoint) - Math.abs(y[0] - medPoint)
  })[0]![0]

  const atPoint = pairs.filter((p) => p.point === modal).map((p) => p.fair)
  if (atPoint.length < opts.minBooks) return null

  const med = median(atPoint)
  const kept = atPoint.filter((f) => Math.abs(f - med) <= opts.outlierDistance)
  if (kept.length < opts.minBooks) return null
  return { fairProbA: median(kept), point: modal, booksUsed: kept.length }
}

/**
 * The house margin on every offered line: the two sides' implied probabilities sum to at least 1 + HOUSE_MARGIN.
 * 2% total (1% per side) is about -105/-105 on an even game. It is a free play-money game, so the edge is kept small
 * so that heavy players are not punished. Applies to newly published and repriced lines only: an accepted pick keeps
 * the price it was given.
 */
export const HOUSE_MARGIN = 0.02

export type PricingConfig = {
  /** Total overround spread across both sides, e.g. 0.02 is about -105/-105. */
  margin: number
  /** Refuse lines where either side is rarer than this fair probability. */
  minFairProb: number
}

export const DEFAULT_PRICING: PricingConfig = { margin: HOUSE_MARGIN, minFairProb: 0.1 }

/**
 * Prices both sides of a market for the contest. Each side's implied
 * probability is its fair probability plus half the margin, so the two sides
 * sum to 1 + margin. Returns null for lopsided markets, where a huge favourite
 * pays almost nothing and the longshot is easy to mis-price.
 */
/** Unrounded American odds for a probability (probToAmerican without its integer rounding). */
const rawAmerican = (prob: number): number => (prob >= 0.5 ? -(prob / (1 - prob)) * 100 : ((1 - prob) / prob) * 100)

/**
 * Rounds AGAINST the player to a multiple of 5: floor, for both signs (-104.3 becomes -105, +143.9 becomes +140). Either way
 * the payout can only shrink, so rounding never lets the two sides' implied probabilities fall below 1 + margin, and a
 * player can never take both sides for a guaranteed profit. An unrounded value is never inside -100..+100 here (a
 * probability at or above one half gives -100 or lower, below one half gives +100 or higher), so the floor stays outside it.
 */
export function tidyAgainstPlayer(rawAmericanOdds: number): number {
  return Math.floor(rawAmericanOdds / 5) * 5
}

export function priceTwoWay(fairProbA: number, cfg: PricingConfig = DEFAULT_PRICING): [number, number] | null {
  const fairB = 1 - fairProbA
  if (fairProbA < cfg.minFairProb || fairB < cfg.minFairProb) return null
  const half = cfg.margin / 2
  return [tidyAgainstPlayer(rawAmerican(fairProbA + half)), tidyAgainstPlayer(rawAmerican(fairB + half))]
}

/** Total return (stake included) for a winning pick, floored to whole credits. */
export const totalReturn = (stake: number, american: number): number => Math.floor(stake * americanToDecimal(american))
