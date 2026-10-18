import { isPickWindowOpen } from "./lines.ts"
import { americanToDecimal } from "./odds.ts"
import type { Outcome } from "./types.ts"

/**
 * Parlays: pure acceptance and settlement rules. The database layer (store.ts) runs acceptParlay inside a transaction that
 * holds the markets' shared locks and the member's row lock, exactly like a single pick.
 */

export const PARLAY_LIMITS = {
  minLegs: 2,
  maxLegs: 6,
  minStake: 10,
  /** Default max stake as a share of the league's starting credits; a league's own pick limit overrides it. */
  maxStakePctOfStart: 2,
} as const

export type ParlayLimits = { minLegs: number; maxLegs: number; minStake: number; maxStakePctOfStart: number }

export type ParlayLegStatus = "open" | "won" | "lost" | "push" | "void"
/** cashed_out: the member sold the whole parlay back before it settled (sports_parlays.payout is the amount paid). */
export type ParlayStatus = "open" | "won" | "lost" | "void" | "cashed_out"

export type ParlayLegRow = {
  lineId: string
  selection: string
  price: number
  point: number | null
  status: ParlayLegStatus
  market: { kind: string; player: null }
  event: { id: string; sport: string; home: string; away: string; startsAt: string }
}

export type ParlayRow = {
  id: string
  stake: number
  /** Combined American odds, rounded (e.g. 595). */
  price: number
  totalReturn: number
  payout: number | null
  status: ParlayStatus
  acceptedAt: string
  legs: ParlayLegRow[]
  name?: string
}

/** Combined decimal odds of a set of American prices (no extra margin). */
export const combinedDecimal = (prices: readonly number[]): number => prices.reduce((acc, p) => acc * americanToDecimal(p), 1)

/** floor(stake x decimal), tolerant of float error just under a whole number. */
export const parlayReturn = (stake: number, decimal: number): number => Math.floor(stake * decimal + 1e-9)

/** Decimal odds back to rounded American odds. */
export function decimalToAmerican(decimal: number): number {
  if (!(decimal > 1)) return -100
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
}

export type ParlayRejectCode =
  | "invalid_stake"
  | "too_few_legs"
  | "too_many_legs"
  | "duplicate_leg"
  | "same_event"
  | "unsupported_leg"
  | "market_closed"
  | "line_mismatch"
  | "insufficient_credits"
  | "stake_too_small"
  | "stake_too_large"
  | "too_many_picks"
  | "too_much_exposure"
  | "return_too_large"

export class ParlayRejected extends Error {
  readonly code: ParlayRejectCode
  constructor(code: ParlayRejectCode, message: string) {
    super(message)
    this.code = code
  }
}

export type ParlayRequest = {
  stake: number
  legs: { lineId: string; expectedPrice: number; expectedPoint: number | null }[]
}

export type ParlayLegContext = {
  market: { id: string; status: string; lockAt: Date; kind: string; player: string | null }
  eventId: string
  eventStatus: string
  eventStartsAt: Date
  line: { id: string; marketId: string; price: number; point: number | null }
}

export type ParlayContext = {
  now: Date
  /** One entry per requested leg, same order. */
  legs: ParlayLegContext[]
  member: { credits: number }
  league: { startingCredits: number; maxReturnPctOfStart: number; maxExposurePctOfStart: number; maxOpenPicks: number }
  /** Open single picks plus open parlays. */
  openPickCount: number
  openStakeTotal: number
}

export type AcceptedParlay = { stake: number; combinedDecimal: number; price: number; totalReturn: number; acceptedAt: Date }

/** Max stake on a parlay for a league. */
export const parlayMaxStake = (startingCredits: number, limits: ParlayLimits = PARLAY_LIMITS) => Math.floor((startingCredits * limits.maxStakePctOfStart) / 100)

const fmt = (price: number, point: number | null) => `${price > 0 ? "+" : ""}${price}${point != null ? ` (${point > 0 ? "+" : ""}${point})` : ""}`

export function acceptParlay(req: ParlayRequest, ctx: ParlayContext, limits: ParlayLimits = PARLAY_LIMITS): AcceptedParlay {
  if (!Number.isInteger(req.stake) || req.stake <= 0) throw new ParlayRejected("invalid_stake", "Stake must be a whole number")
  if (req.legs.length < limits.minLegs) throw new ParlayRejected("too_few_legs", `A parlay needs at least ${limits.minLegs} legs`)
  if (req.legs.length > limits.maxLegs) throw new ParlayRejected("too_many_legs", `A parlay can have at most ${limits.maxLegs} legs`)
  if (new Set(req.legs.map((l) => l.lineId)).size !== req.legs.length) throw new ParlayRejected("duplicate_leg", "Each leg must be a different line")
  if (ctx.legs.length !== req.legs.length) throw new ParlayRejected("line_mismatch", "A line in your parlay is no longer available")

  const events = new Set<string>()
  req.legs.forEach((leg, i) => {
    const c = ctx.legs[i]!
    if (c.market.player != null || c.market.kind === "player_prop") throw new ParlayRejected("unsupported_leg", "Player props can't go in a parlay")
    if (!isPickWindowOpen(c.market, c.eventStatus, ctx.now, c.eventStartsAt)) throw new ParlayRejected("market_closed", "One of your legs is closed for picks")
    if (c.line.marketId !== c.market.id) throw new ParlayRejected("line_mismatch", "A line in your parlay is not part of its market")
    if (c.line.price !== leg.expectedPrice || c.line.point !== leg.expectedPoint) {
      throw new ParlayRejected("line_mismatch", `A line moved to ${fmt(c.line.price, c.line.point)} since you added it. Review the new price and try again`)
    }
    if (events.has(c.eventId)) throw new ParlayRejected("same_event", "Only one leg per game")
    events.add(c.eventId)
  })

  const start = ctx.league.startingCredits
  const maxStake = parlayMaxStake(start, limits)
  if (req.stake < limits.minStake) throw new ParlayRejected("stake_too_small", `Minimum parlay stake is ${limits.minStake}`)
  if (req.stake > maxStake) throw new ParlayRejected("stake_too_large", `Maximum parlay stake is ${maxStake}`)
  if (req.stake > ctx.member.credits) throw new ParlayRejected("insufficient_credits", "Not enough cash")
  if (ctx.openPickCount >= ctx.league.maxOpenPicks) throw new ParlayRejected("too_many_picks", `You can have ${ctx.league.maxOpenPicks} open picks at a time`)
  if (ctx.openStakeTotal + req.stake > Math.floor((start * ctx.league.maxExposurePctOfStart) / 100)) {
    throw new ParlayRejected("too_much_exposure", "That would put too much cash at risk at once")
  }

  const decimal = combinedDecimal(ctx.legs.map((c) => c.line.price))
  const ret = parlayReturn(req.stake, decimal)
  if (ret - req.stake > Math.floor((start * ctx.league.maxReturnPctOfStart) / 100)) {
    throw new ParlayRejected("return_too_large", "That parlay could win too much for one slip")
  }
  return { stake: req.stake, combinedDecimal: decimal, price: decimalToAmerican(decimal), totalReturn: ret, acceptedAt: ctx.now }
}

/* ---- settlement ---- */

export const LEG_STATUS_OF: Record<Outcome, ParlayLegStatus> = { win: "won", loss: "lost", push: "push", void: "void" }

export type ParlaySettlement =
  | { status: "open"; payout: null }
  | { status: "lost"; payout: 0 }
  | { status: "void"; payout: number }
  | { status: "won"; payout: number }

/**
 * Where a parlay stands given its legs' statuses. A lost leg decides it immediately. Pushed and voided legs drop out (their
 * odds become 1.0); with every leg dropped the stake is refunded. Otherwise it waits until no leg is open.
 */
export function decideParlay(stake: number, legs: readonly { status: ParlayLegStatus; price: number }[]): ParlaySettlement {
  if (legs.some((l) => l.status === "lost")) return { status: "lost", payout: 0 }
  if (legs.some((l) => l.status === "open")) return { status: "open", payout: null }
  const won = legs.filter((l) => l.status === "won")
  if (won.length === 0) return { status: "void", payout: stake }
  return { status: "won", payout: parlayReturn(stake, combinedDecimal(won.map((l) => l.price))) }
}

export const parlaySettleKey = (parlayId: string) => `parlay:${parlayId}:settle`
export const parlayCashoutKey = (parlayId: string) => `parlay:${parlayId}:cashout`
export const parlayPlaceKey = (parlayId: string) => `parlay:${parlayId}:place`
