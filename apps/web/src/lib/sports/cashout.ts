import { americanToProb } from "./odds.ts"
import { sideProb } from "./live/position.ts"
import { freshnessOf } from "./live/freshness.ts"
import type { LiveView } from "./live/view.ts"

/**
 * Cash-out pricing. Pure.
 *
 * An open pick can be sold back before it settles. The price is the pick's total return times the current chance that
 * its side wins, less a house fee, so selling never beats waiting on average and an unchanged line returns a bit under the stake.
 * Two honest sources of "current chance":
 *  - before kickoff, the market's own current price for the same line (and the same point), while the market is open;
 *  - in play, the fresh live exchange quote for a moneyline side. Anything else (stale, thin or disagreeing quote, spreads
 *    and totals once the game has started, props) is not offered rather than guessed.
 */

export const CASHOUT_FEE = 0.05
/** If the price fell by more than this share between the quote the member saw and the click, the sale is refused and re-quoted. */
export const CASHOUT_TOLERANCE = 0.01

export type CashoutPick = { stake: number; totalReturn: number; kind: string; selection: string; point: number | null }
export type CashoutQuote = { value: number; source: "pregame" | "live"; probability: number }

export type CashoutRejectCode = "unavailable" | "moved"
export class CashoutRejected extends Error {
  readonly code: CashoutRejectCode
  constructor(code: CashoutRejectCode, message: string) {
    super(message)
    this.code = code
  }
}

export const price = (totalReturn: number, probability: number) => Math.floor(totalReturn * probability * (1 - CASHOUT_FEE) + 1e-9)

/** Before kickoff: the chance implied by the same line's current price. Null when the line is closed, or its point moved (then it is not the same bet). */
export function pregameProbability(point: number | null, line: { price: number; point: number | null } | null, windowOpen: boolean): number | null {
  if (!windowOpen || !line) return null
  if ((line.point ?? null) !== (point ?? null)) return null
  return americanToProb(line.price)
}

/** In play: a fresh, confident live moneyline chance for a side, else null. `elapsedMs` is the time since the view was read. */
export function liveProbability(kind: string, selection: string, view: LiveView | null, elapsedMs = 0): number | null {
  if (!view || view.status !== "live" || view.odds.status !== "ok") return null
  if (kind !== "moneyline") return null
  if (view.odds.confidence !== "high" || view.odds.mismatch) return null
  if (freshnessOf(view.odds.ageMs + Math.max(0, elapsedMs)) !== "live") return null
  return sideProb(view, kind, selection)
}

/** Before kickoff: the same line's current price. Null when the line is closed, or its point moved (then it is not the same bet). */
export function pregameCashout(pick: CashoutPick, line: { price: number; point: number | null } | null, windowOpen: boolean): CashoutQuote | null {
  const probability = pregameProbability(pick.point, line, windowOpen)
  if (probability == null) return null
  const value = Math.min(price(pick.totalReturn, probability), pick.totalReturn)
  return value >= 1 ? { value, source: "pregame", probability } : null
}

/** In play: a fresh, confident live quote for a moneyline side. `elapsedMs` is the time since the view was read. */
export function liveCashout(pick: CashoutPick, view: LiveView | null, elapsedMs = 0): CashoutQuote | null {
  const probability = liveProbability(pick.kind, pick.selection, view, elapsedMs)
  if (probability == null) return null
  const value = Math.min(price(pick.totalReturn, probability), pick.totalReturn)
  return value >= 1 ? { value, source: "live", probability } : null
}

/** What to pay for a sale the member agreed to at `expected`: their price if the quote held or rose, the lower quote if it slipped within tolerance, else a refusal. */
export function settleCashout(expected: number, current: number): number {
  if (!Number.isInteger(expected) || expected < 1) throw new CashoutRejected("unavailable", "That cash-out price is not valid")
  if (current < Math.floor(expected * (1 - CASHOUT_TOLERANCE))) throw new CashoutRejected("moved", "The price moved. Review the new cash-out value and try again")
  return Math.min(expected, current)
}
