import { isPickWindowOpen } from "./lines.ts"
import { totalReturn } from "./odds.ts"

/**
 * Pick validation: caps, locking and the accepted-line snapshot. Pure. The
 * database layer runs this inside a transaction that holds a row lock on the
 * member, so the balance it sees is the balance it debits.
 */

export type PickLimits = {
  minStake: number
  /** Max stake on one pick as a share of the league's starting credits. */
  maxStakePctOfStart: number
  /** Max picks that are still open. */
  maxOpenPicks: number
  /** Max total credits at risk across open picks, as a share of starting credits. */
  maxExposurePctOfStart: number
  /** No single pick may return more than this multiple of starting credits. */
  maxReturnPctOfStart: number
}

export const DEFAULT_LIMITS: PickLimits = {
  minStake: 10,
  maxStakePctOfStart: 10,
  maxOpenPicks: 20,
  maxExposurePctOfStart: 60,
  maxReturnPctOfStart: 50,
}

export type PickRejectCode =
  | "invalid_stake"
  | "market_closed"
  | "line_mismatch"
  | "already_picked"
  | "insufficient_credits"
  | "stake_too_small"
  | "stake_too_large"
  | "too_many_picks"
  | "too_much_exposure"
  | "return_too_large"

export class PickRejected extends Error {
  readonly code: PickRejectCode
  constructor(code: PickRejectCode, message: string) {
    super(message)
    this.code = code
  }
}

export type PickRequest = {
  stake: number
  lineId: string
  /** The price the client saw. If it no longer matches, the pick is refused, never silently re-priced. */
  expectedPrice: number
  expectedPoint: number | null
}

export type PickContext = {
  now: Date
  market: { id: string; status: string; lockAt: Date }
  eventStatus: string
  /** Scheduled kickoff. Picks are refused from this instant whatever the market's lock says. */
  eventStartsAt: Date
  line: { id: string; marketId: string; price: number; point: number | null }
  member: { credits: number }
  league: { startingCredits: number }
  /** The member's picks on THIS market already (any status except void). */
  picksOnMarket: number
  openPickCount: number
  openStakeTotal: number
}

export type AcceptedPick = {
  stake: number
  /** Frozen copy of the line the user got. Later line changes never touch it. */
  price: number
  point: number | null
  totalReturn: number
  acceptedAt: Date
}

export function acceptPick(req: PickRequest, ctx: PickContext, limits: PickLimits = DEFAULT_LIMITS): AcceptedPick {
  if (!Number.isInteger(req.stake) || req.stake <= 0) throw new PickRejected("invalid_stake", "Stake must be a whole number")
  if (!isPickWindowOpen(ctx.market, ctx.eventStatus, ctx.now, ctx.eventStartsAt)) throw new PickRejected("market_closed", "Picks are closed for this market")
  if (ctx.line.marketId !== ctx.market.id) throw new PickRejected("line_mismatch", "That line is not part of this market")
  if (ctx.line.price !== req.expectedPrice || ctx.line.point !== req.expectedPoint) {
    throw new PickRejected("line_mismatch", "The line changed. Review the current line and try again")
  }
  if (ctx.picksOnMarket > 0) throw new PickRejected("already_picked", "You already have a pick on this market")

  const start = ctx.league.startingCredits
  const maxStake = Math.floor((start * limits.maxStakePctOfStart) / 100)
  if (req.stake < limits.minStake) throw new PickRejected("stake_too_small", `Minimum stake is ${limits.minStake}`)
  if (req.stake > maxStake) throw new PickRejected("stake_too_large", `Maximum stake per pick is ${maxStake}`)
  if (req.stake > ctx.member.credits) throw new PickRejected("insufficient_credits", "Not enough cash")
  if (ctx.openPickCount >= limits.maxOpenPicks) throw new PickRejected("too_many_picks", `You can have ${limits.maxOpenPicks} open picks at a time`)
  if (ctx.openStakeTotal + req.stake > Math.floor((start * limits.maxExposurePctOfStart) / 100)) {
    throw new PickRejected("too_much_exposure", "That would put too much cash at risk at once")
  }

  const ret = totalReturn(req.stake, ctx.line.price)
  if (ret - req.stake > Math.floor((start * limits.maxReturnPctOfStart) / 100)) {
    throw new PickRejected("return_too_large", "That pick could win too much for one slip")
  }
  return { stake: req.stake, price: ctx.line.price, point: ctx.line.point, totalReturn: ret, acceptedAt: ctx.now }
}
