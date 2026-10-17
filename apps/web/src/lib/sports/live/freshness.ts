import type { Freshness } from "./types.ts"

/** Under 30s is live, 30 to 120s is delayed, past 120s is stale and the odds are hidden ("odds paused"). */
export const LIVE_MAX_MS = 30_000
export const DELAYED_MAX_MS = 120_000
/** A quote stamped this far in the future is a clock fault, not freshness. Small skew is clamped to zero. */
export const CLOCK_SKEW_MS = 5_000

export function freshnessOf(ageMs: number): Freshness {
  if (!Number.isFinite(ageMs)) return "stale"
  if (ageMs < -CLOCK_SKEW_MS) return "stale"
  const age = Math.max(0, ageMs)
  if (age < LIVE_MAX_MS) return "live"
  if (age <= DELAYED_MAX_MS) return "delayed"
  return "stale"
}

export const ageOf = (asOf: Date, now: Date): number => now.getTime() - asOf.getTime()

/** "4s ago", "1m ago": the as-of text next to the chip. */
export function agoLabel(ageMs: number): string {
  const s = Math.max(0, Math.round(ageMs / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
}
