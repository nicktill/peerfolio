import { priceTwoWay } from "./odds.ts"
import { REPRICE } from "./reprice-config.ts"
import { priceThreeWay, type Triple } from "./threeway.ts"
import type { ThreeWayExchangeResult } from "./threeway-exchange.ts"

/**
 * Pregame repricing: decides, from an exchange mid, whether an OPEN market's offered line should move, stay, or freeze.
 * Pure. The only place where exchange data influences a price a user can pick at. It never touches accepted picks:
 * a pick copies price, point and total return when it is accepted, and settlement/grading read only those copies and
 * the independent results feeds (a source-level test enforces that nothing in the money path imports exchange code).
 *
 * Price convention (unchanged from consensus publishing): `priceTwoWay(fairProb)` adds half of the 2% HOUSE_MARGIN to each
 * side's fair probability and rounds against the player to a multiple of 5, so the house edge is the same as before. Exchange mids of the two
 * outcome books already sum to about 1 (no vig), so the mid renormalised is used as the fair probability directly.
 */

export { REPRICE }

export type ExchangeView = {
  /** Probability of the market's FIRST side (home for moneyline/spread, over for totals). */
  probA: number
  spread: number | null
  /** Smallest size resting at the best bid and best ask of the books used (shares); null when the source does not report sizes. */
  topSize: number | null
  /** Age of our read of the book. */
  ageMs: number
  /** Age of the book's own timestamp, if it gave one. */
  bookTsAgeMs: number | null
  source: "polymarket" | "kalshi"
  /** A second order-book source's view of the same side, for the cross-check. */
  other: { source: "polymarket" | "kalshi"; probA: number } | null
  /** The exchange says the game is already in play. */
  gameLive: boolean
  acceptingOrders: boolean
  /** Exchange line for spreads/totals; null for a game winner. */
  point: number | null
}

export type MarketState = {
  kind: string
  status: string
  lockAt: Date
  createdAt: Date
  /** Fair probability of side A behind the current prices (consensus at publish, then each exchange reprice). */
  fairProbA: number | null
  pointA: number | null
  /** Current offered prices, one per side: two, or three [home, draw, away] for the soccer moneyline. */
  prices: number[]
  /** Fair probability behind each offered price, same order; null until known (three-way markets need it as their basis). */
  fairs?: number[] | null
  repricedAt: Date | null
  /** Number of line writes so far; with the basis it identifies the version a decision was made from. */
  repriceCount: number
  exchangeOkAt: Date | null
  /** Fair probabilities of side A over the last hour (from line history), oldest first. */
  history: { at: Date; fairProbA: number; /** All sides' fair probabilities, three-way only. */ fairs?: number[] }[]
}

export type RepriceInput = {
  now: Date
  startsAt: Date
  eventStatus: string
  market: MarketState
  /** Null: no usable exchange read (no match, unavailable, error). Two-way markets. */
  exchange: ExchangeView | null
  /** Three-way markets: the outcome of `exchangeThreeWay` over the three YES books (it applies the same gates as below to every leg). Null: no usable read. */
  exchange3?: ThreeWayExchangeResult | null
  /** How long a managed market may go without a good exchange read before it freezes. Defaults to `REPRICE.staleFreezeMs`; far-out markets are read less often, so the pass gives them `farStaleFreezeMs`. */
  staleFreezeMs?: number
}

export type Decision =
  | { action: "none"; reason: string; /** Exchange was healthy: stamp `exchange_ok_at` (throttled by the caller). */ confirm: boolean }
  | { action: "update"; prices: number[]; fairProbA: number; /** Fair probability per side, same order as `prices` (three-way). */ fairs?: number[]; source: string; spread: number | null; ageMs: number; step: number }
  | { action: "freeze"; reason: string }

const none = (reason: string, confirm = false): Decision => ({ action: "none", reason, confirm })

export function decideReprice(input: RepriceInput): Decision {
  const { now, startsAt, eventStatus, market: m, exchange: x } = input
  // Time and state gates first, on the server clock. Nothing below can reopen or reprice a closed market.
  if (now.getTime() >= startsAt.getTime()) return none("kickoff")
  if (eventStatus !== "scheduled" || m.status !== "open" || now.getTime() >= m.lockAt.getTime()) return none("closed")

  const managed = m.exchangeOkAt != null
  const freezeAfter = input.staleFreezeMs ?? REPRICE.staleFreezeMs
  const lastGood = Math.max(m.exchangeOkAt?.getTime() ?? 0, m.repricedAt?.getTime() ?? 0)
  // A market the exchange has been managing must not sit on an old price when the exchange goes quiet.
  const hold = (reason: string): Decision => (managed && now.getTime() - lastGood > freezeAfter ? { action: "freeze", reason: `exchange ${reason} for over ${Math.round(freezeAfter / 60_000)} min` } : none(reason))

  if (m.prices.length === 3) return decideThreeWay(input, hold, managed)

  if (!x) return hold("unavailable")
  // Game winner markets match by teams. Spreads and totals only with the exchange line at EXACTLY the offered point.
  if (m.kind !== "moneyline" && (x.point == null || m.pointA == null || x.point !== m.pointA)) return none("no exact point match")
  if (m.kind === "player_prop") return none("props stay on consensus")

  if (x.gameLive) return { action: "freeze", reason: "exchange shows the game in play before its scheduled start" }
  if (!x.acceptingOrders) return hold("not accepting orders")
  if (x.ageMs > REPRICE.maxAgeMs) return hold("read too old")
  if (x.bookTsAgeMs != null && x.bookTsAgeMs > REPRICE.maxBookTsAgeMs) return hold("book timestamp stuck")
  if (x.spread == null || x.spread > REPRICE.maxSpread) return hold("book too wide")
  if (x.topSize == null || x.topSize < REPRICE.minTopSize) return hold("book too thin")
  if (!(x.probA > 0 && x.probA < 1)) return hold("invalid price")
  if (x.other && Math.abs(x.other.probA - x.probA) > REPRICE.disagree) return hold("sources disagree")

  if (x.probA < REPRICE.minFair || x.probA > 1 - REPRICE.minFair) return { action: "freeze", reason: "price outside the repricing range" }

  const basis = m.fairProbA ?? x.probA
  const step = Math.abs(x.probA - basis)
  // A single source may move a managed line only a little per step; the bigger first-contact gap needs both exchanges to agree.
  const bothAgree = x.other != null && Math.abs(x.other.probA - x.probA) <= REPRICE.disagree
  const limit = managed || !bothAgree ? REPRICE.maxStep : REPRICE.firstContactMax
  if (step > limit) return { action: "freeze", reason: managed ? "exchange jump" : "exchange and published line disagree" }
  const recent = m.history.filter((h) => now.getTime() - h.at.getTime() <= REPRICE.hourMs).map((h) => h.fairProbA)
  const all = [...recent, x.probA]
  if (Math.max(...all) - Math.min(...all) > REPRICE.hourRange) return { action: "freeze", reason: "exchange moved too far in an hour" }

  const prices = priceTwoWay(x.probA)
  if (!prices) return { action: "freeze", reason: "market too lopsided" }
  if (step < REPRICE.minMove) return none("within threshold", true)
  if (prices[0] === m.prices[0] && prices[1] === m.prices[1]) return none("same price", true)
  if (m.repricedAt && now.getTime() - m.repricedAt.getTime() < REPRICE.minIntervalMs) return none("min interval")
  return { action: "update", prices, fairProbA: x.probA, source: x.source, spread: x.spread, ageMs: x.ageMs, step }
}

/**
 * The soccer moneyline [home, draw, away]. Same state machine as the two-way decision, over a fair triple: the gates for every
 * leg live in `exchangeThreeWay` (spread, size, read age, timestamp, sum, cross-source disagreement, range); a gate that holds
 * keeps the line (and the stale-freeze applies), one that freezes closes it. The step is the largest move of any side.
 */
function decideThreeWay(input: RepriceInput, hold: (reason: string) => Decision, managed: boolean): Decision {
  const { now, market: m } = input
  const x3 = input.exchange3
  if (!x3) return hold("unavailable")
  if (!x3.ok) return x3.action === "freeze" ? { action: "freeze", reason: x3.reason } : hold(x3.reason)
  const v = x3.view
  // A three-way basis comes from the stored per-side fair probabilities; without them nothing bounds the first move, so hold.
  const basis = m.fairs && m.fairs.length === 3 ? m.fairs : null
  if (!basis) return hold("no fair basis stored")
  const step = Math.max(...v.fair.map((f, i) => Math.abs(f - basis[i]!)))
  const bothAgree = v.other != null
  const limit = managed || !bothAgree ? REPRICE.maxStep : REPRICE.firstContactMax
  if (step > limit) return { action: "freeze", reason: managed ? "exchange jump" : "exchange and published line disagree" }
  const recent = m.history.filter((h) => now.getTime() - h.at.getTime() <= REPRICE.hourMs && h.fairs && h.fairs.length === 3)
  for (let i = 0; i < 3; i++) {
    const all = [...recent.map((h) => h.fairs![i]!), v.fair[i]!]
    if (Math.max(...all) - Math.min(...all) > REPRICE.hourRange) return { action: "freeze", reason: "exchange moved too far in an hour" }
  }
  const prices = priceThreeWay(v.fair as Triple)
  if (!prices) return { action: "freeze", reason: "market too lopsided" }
  if (step < REPRICE.minMove) return none("within threshold", true)
  if (prices.every((p, i) => p === m.prices[i])) return none("same price", true)
  if (m.repricedAt && now.getTime() - m.repricedAt.getTime() < REPRICE.minIntervalMs) return none("min interval")
  return { action: "update", prices, fairProbA: v.fair[0], fairs: v.fair, source: v.source, spread: v.spread, ageMs: v.ageMs, step }
}

/** Whether a "confirm" stamp is due (throttled so unchanged markets do not write every pass). */
export const confirmDue = (m: Pick<MarketState, "exchangeOkAt">, now: Date): boolean => !m.exchangeOkAt || now.getTime() - m.exchangeOkAt.getTime() >= REPRICE.confirmEveryMs

/** An open pregame market with everything the repricer needs. Built by the store, consumed by the worker's pass. */
export type RepriceTarget = {
  marketId: string
  eventId: string
  sport: string
  homeName: string
  awayName: string
  startsAt: Date
  eventStatus: string
  state: MarketState
}

export type RepriceResult = { applied: boolean; reason?: string; oldPrices?: number[]; newPrices?: number[]; version?: number }

/** What the worker needs from the database for repricing (implemented by store.ts; injected so tests need no database). */
export type RepriceStore = {
  listTargets(now: Date): Promise<RepriceTarget[]>
  apply(marketId: string, expected: { basis: number | null; count: number }, decision: Extract<Decision, { action: "update" }>, now: Date): Promise<RepriceResult>
  freeze(marketId: string, reason: string): Promise<boolean>
  /** Reopens a market frozen for a dead worker, after a healthy exchange read for it. Optional: stores without it never reopen. */
  reopen?(marketId: string, now: Date): Promise<boolean>
  confirm(marketIds: string[], now: Date): Promise<void>
}
