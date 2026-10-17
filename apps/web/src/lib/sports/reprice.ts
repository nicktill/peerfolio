import { priceTwoWay } from "./odds.ts"

/**
 * Pregame repricing: decides, from an exchange mid, whether an OPEN market's offered line should move, stay, or freeze.
 * Pure. The only place where exchange data influences a price a user can pick at. It never touches accepted picks:
 * a pick copies price, point and total return when it is accepted, and settlement/grading read only those copies and
 * the independent results feeds (a source-level test enforces that nothing in the money path imports exchange code).
 *
 * Price convention (unchanged from consensus publishing): `priceTwoWay(fairProb)` adds half of a 4.5% margin to each
 * side's fair probability and rounds to the nearest 5, so the house edge is the same as before. Exchange mids of the two
 * outcome books already sum to about 1 (no vig), so the mid renormalised is used as the fair probability directly.
 */

export const REPRICE = {
  /** Freshest read we accept: our fetch of the book must be this young. */
  maxAgeMs: 60_000,
  /** Widest best-bid/best-ask gap (probability points) we price from. */
  maxSpread: 0.06,
  /** A book's own timestamp older than this is a stuck feed even if we just fetched it. */
  maxBookTsAgeMs: 10 * 60_000,
  /** Polymarket and Kalshi further apart than this: skip (hold the current line). */
  disagree: 0.05,
  /** Move the line only when the fair probability drifted at least this far from the last priced basis. */
  minMove: 0.015,
  /** At most one line write per market in this interval. */
  minIntervalMs: 30_000,
  /** One reprice may not move fair probability more than this; a bigger jump freezes the market. */
  maxStep: 0.08,
  /** Total range of fair probability over the last hour above this freezes the market. */
  hourRange: 0.15,
  hourMs: 3_600_000,
  /** First exchange contact: the published (consensus) basis and the exchange may differ by this much, else freeze. */
  firstContactMax: 0.12,
  /** A market the exchange manages freezes if no good exchange read arrives for this long. */
  staleFreezeMs: 10 * 60_000,
  /** Re-stamp `exchange_ok_at` at most this often when nothing moved. */
  confirmEveryMs: 5 * 60_000,
  /** Only games starting within this window are repriced at the fast cadence (keeps a serverless DB able to sleep). */
  windowMs: 3 * 3_600_000,
  /** Pass cadence inside the window, and outside it (further-out games still get a slow pass). */
  passMs: 60_000,
  farPassMs: 15 * 60_000,
} as const

export type ExchangeView = {
  /** Probability of the market's FIRST side (home for moneyline/spread, over for totals). */
  probA: number
  spread: number | null
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
  /** Current offered prices of the first and second side. */
  prices: [number, number]
  repricedAt: Date | null
  exchangeOkAt: Date | null
  /** Fair probabilities of side A over the last hour (from line history), oldest first. */
  history: { at: Date; fairProbA: number }[]
}

export type RepriceInput = {
  now: Date
  startsAt: Date
  eventStatus: string
  market: MarketState
  /** Null: no usable exchange read (no match, unavailable, error). */
  exchange: ExchangeView | null
}

export type Decision =
  | { action: "none"; reason: string; /** Exchange was healthy: stamp `exchange_ok_at` (throttled by the caller). */ confirm: boolean }
  | { action: "update"; prices: [number, number]; fairProbA: number; source: string; spread: number | null; ageMs: number; step: number }
  | { action: "freeze"; reason: string }

const none = (reason: string, confirm = false): Decision => ({ action: "none", reason, confirm })

export function decideReprice(input: RepriceInput): Decision {
  const { now, startsAt, eventStatus, market: m, exchange: x } = input
  // Time and state gates first, on the server clock. Nothing below can reopen or reprice a closed market.
  if (now.getTime() >= startsAt.getTime()) return none("kickoff")
  if (eventStatus !== "scheduled" || m.status !== "open" || now.getTime() >= m.lockAt.getTime()) return none("closed")

  const managed = m.exchangeOkAt != null
  const lastGood = Math.max(m.exchangeOkAt?.getTime() ?? 0, m.repricedAt?.getTime() ?? 0)
  // A market the exchange has been managing must not sit on an old price when the exchange goes quiet.
  const hold = (reason: string): Decision => (managed && now.getTime() - lastGood > REPRICE.staleFreezeMs ? { action: "freeze", reason: `exchange ${reason} for over ${REPRICE.staleFreezeMs / 60_000} min` } : none(reason))

  if (!x) return hold("unavailable")
  // Game winner markets match by teams. Spreads and totals only with the exchange line at EXACTLY the offered point.
  if (m.kind !== "moneyline" && (x.point == null || m.pointA == null || x.point !== m.pointA)) return none("no exact point match")
  if (m.kind === "player_prop") return none("props stay on consensus")

  if (x.gameLive) return { action: "freeze", reason: "exchange shows the game in play before its scheduled start" }
  if (!x.acceptingOrders) return hold("not accepting orders")
  if (x.ageMs > REPRICE.maxAgeMs) return hold("read too old")
  if (x.bookTsAgeMs != null && x.bookTsAgeMs > REPRICE.maxBookTsAgeMs) return hold("book timestamp stuck")
  if (x.spread == null || x.spread > REPRICE.maxSpread) return hold("book too wide")
  if (!(x.probA > 0 && x.probA < 1)) return hold("invalid price")
  if (x.other && Math.abs(x.other.probA - x.probA) > REPRICE.disagree) return hold("sources disagree")

  const basis = m.fairProbA ?? x.probA
  const step = Math.abs(x.probA - basis)
  if (managed ? step > REPRICE.maxStep : step > REPRICE.firstContactMax) return { action: "freeze", reason: managed ? "exchange jump" : "exchange and published line disagree" }
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

export type RepriceResult = { applied: boolean; reason?: string; oldPrices?: [number, number]; newPrices?: [number, number]; version?: number }

/** What the worker needs from the database for repricing (implemented by store.ts; injected so tests need no database). */
export type RepriceStore = {
  listTargets(now: Date): Promise<RepriceTarget[]>
  apply(marketId: string, expectedBasis: number | null, decision: Extract<Decision, { action: "update" }>, now: Date): Promise<RepriceResult>
  freeze(marketId: string, reason: string): Promise<boolean>
  confirm(marketIds: string[], now: Date): Promise<void>
}
