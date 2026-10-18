import { liveProbability, pregameProbability, price } from "./cashout.ts"
import { combinedDecimal, parlayReturn, type ParlayLegStatus } from "./parlay.ts"
import type { LiveView } from "./live/view.ts"

/**
 * Parlay cash-out pricing. Pure.
 *
 * value = (the parlay's return with pushed and voided legs dropped) x (product of each remaining leg's chance of winning) x (1 - fee),
 * the fee applied once, never above that return, floored to a whole credit. A won leg counts 1. A lost leg means the parlay is lost:
 * no value. An open leg is priced from the market's own current price for the same line before kickoff, or from a fresh confident
 * live moneyline quote once the game is on. If any open leg cannot be priced that way the whole parlay is not priced: nothing is guessed.
 */

export type ParlayCashoutLeg = {
  status: ParlayLegStatus
  /** The American price locked in at acceptance. */
  price: number
  kind: string
  selection: string
  point: number | null
  /** pregame: market open and before kickoff. live: kicked off, feed still scheduled. closed: anything else. */
  phase: "pregame" | "live" | "closed"
  /** The leg's line as priced right now. */
  line: { price: number; point: number | null } | null
  view: LiveView | null
}

export type ParlayCashoutPrice =
  | {
      available: true
      value: number
      probability: number
      /** The return with dropped legs removed. */
      fullReturn: number
      /** The same without the fee or rounding: for a view-only estimate. */
      estimate: number
      source: "pregame" | "live" | "mixed"
    }
  | { available: false; reason: string }

const no = (reason: string): ParlayCashoutPrice => ({ available: false, reason })

export function priceParlayCashout(parlay: { stake: number; totalReturn: number }, legs: readonly ParlayCashoutLeg[], elapsedMs = 0): ParlayCashoutPrice {
  if (legs.length === 0) return no("This parlay has no legs")
  if (legs.some((l) => l.status === "lost")) return no("This parlay has a losing leg")
  const kept = legs.filter((l) => l.status !== "push" && l.status !== "void")
  if (!kept.some((l) => l.status === "open")) return no("This parlay is already settled")
  // Pushed and voided legs drop out exactly as settlement drops them; with none dropped the accepted return is used as is.
  const fullReturn = kept.length === legs.length ? parlay.totalReturn : parlayReturn(parlay.stake, combinedDecimal(kept.map((l) => l.price)))
  let probability = 1
  const sources = new Set<"pregame" | "live">()
  for (const leg of kept) {
    if (leg.status === "won") continue
    let p: number | null
    if (leg.phase === "pregame") {
      p = pregameProbability(leg.point, leg.line, true)
      if (p == null) return no("A leg's price isn't available right now")
      sources.add("pregame")
    } else if (leg.phase === "live") {
      p = liveProbability(leg.kind, leg.selection, leg.view, elapsedMs)
      if (p == null) return no("Cash-out needs a fresh live price for every game in play")
      sources.add("live")
    } else {
      return no("A game is over and waiting for its result")
    }
    probability *= p
  }
  const value = Math.min(price(fullReturn, probability), fullReturn)
  if (value < 1) return no("The price is too low to sell")
  return { available: true, value, probability, fullReturn, estimate: fullReturn * probability, source: sources.size > 1 ? "mixed" : sources.has("live") ? "live" : "pregame" }
}
