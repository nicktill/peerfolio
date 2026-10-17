import { agoLabel, freshnessOf } from "./freshness.ts"
import type { LiveView } from "./view.ts"

/** Display helpers for the live strip. Pure, so the wording rules are tested. */

export type Chip = { tone: "live" | "delayed" | "paused" | "final" | "waiting"; label: string; ago: string | null }

/**
 * The freshness chip. `elapsedMs` is how long ago the response was received in this browser: the server's
 * ageMs was true at serverTime, so the age shown now is ageMs plus the time since (a cached or slow response
 * never looks fresher than it is).
 */
export function chipFor(view: LiveView | null, elapsedMs: number): Chip {
  if (!view) return { tone: "waiting", label: "Connecting", ago: null }
  if (view.status === "final") return { tone: "final", label: "Final", ago: null }
  if (view.odds.status === "ok") {
    const age = view.odds.ageMs + Math.max(0, elapsedMs)
    const f = freshnessOf(age)
    if (f === "stale") return { tone: "paused", label: "Odds paused", ago: agoLabel(age) }
    return { tone: f === "live" ? "live" : "delayed", label: f === "live" ? "Live" : "Delayed", ago: agoLabel(age) }
  }
  return { tone: "paused", label: "Odds paused", ago: null }
}

export const pct = (p: number): string => `${Math.round(p * 100)}%`

/** Win probability shown as whole percents that always add to 100. */
export function splitPct(homeProb: number): { home: number; away: number } {
  const home = Math.min(99, Math.max(1, Math.round(homeProb * 100)))
  return { home, away: 100 - home }
}

/** Home / draw / away as whole percents that always add to 100 (each at least 1, so no segment disappears). */
export function splitPct3(homeProb: number, drawProb: number): { home: number; draw: number; away: number } {
  const home = Math.min(98, Math.max(1, Math.round(homeProb * 100)))
  const draw = Math.min(99 - home, Math.max(1, Math.round(drawProb * 100)))
  return { home, draw, away: 100 - home - draw }
}

export function statusLine(view: LiveView): string | null {
  if (view.status === "final") return "Final"
  const parts = [view.period, view.clock].filter((x): x is string => !!x)
  return parts.length ? parts.join(" ") : null
}

export const PAUSED_REASON: Record<string, string> = {
  no_quote: "No live odds for this game",
  stale: "Odds feed delayed; waiting for a fresh price",
  sources_disagree: "Sources disagree; waiting for them to settle",
  wide_spread: "Market too thin for a reliable number",
  game_over: "Game over",
}
