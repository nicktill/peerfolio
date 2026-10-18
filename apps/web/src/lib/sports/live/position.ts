import { freshnessOf } from "./freshness.ts"
import { price } from "../cashout-price.ts"
import type { LiveView } from "./view.ts"

/**
 * Display-only estimate of an open pick's worth right now: the pick's total return times the live chance of its
 * side winning, through the same `price` as the cash-out quote so the two agree. It is not a cash-out, never changes credits and never feeds settlement.
 */

export type PositionPick = { stake: number; totalReturn: number; kind: string; selection: string }
export type LivePosition = { prob: number; value: number; pl: number }

/** Profit if the pick wins ("to win"), never negative. */
export const toWin = (p: { stake: number; totalReturn: number }): number => Math.max(0, p.totalReturn - p.stake)

/** The live chance for the pick's side, or null when it is not a moneyline side the live view prices. */
export function sideProb(view: LiveView, kind: string, selection: string): number | null {
  if (kind !== "moneyline" || view.odds.status !== "ok") return null
  const o = view.odds
  const p = selection === "home" ? o.homeProb : selection === "away" ? o.awayProb : selection === "draw" ? o.drawProb : null
  return p != null && Number.isFinite(p) && p >= 0 && p <= 1 ? p : null
}

/** `elapsedMs` is the time since the response arrived, so the age shown matches the freshness chip. Null hides the value. */
export function livePosition(pick: PositionPick, view: LiveView | null, elapsedMs: number, started = false): LivePosition | null {
  // The score feed can lag or lack a game (common in college football) while the exchange quote is live and fresh: when the game has
  // started by the clock (`started`), trust the fresh quote unless the feed says it is over.
  const running = view?.status === "live" || (started && (view?.status === "pre" || view?.status === "unknown"))
  if (!view || !running || view.odds.status !== "ok") return null
  if (!(pick.stake > 0) || !(pick.totalReturn > 0)) return null
  if (freshnessOf(view.odds.ageMs + Math.max(0, elapsedMs)) === "stale") return null
  const prob = sideProb(view, pick.kind, pick.selection)
  if (prob == null) return null
  const value = price(pick.totalReturn, prob)
  return { prob, value, pl: value - pick.stake }
}
