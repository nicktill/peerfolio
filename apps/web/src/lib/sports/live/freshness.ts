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

/**
 * Where the displayed age of a quote can come from, in the worst case, from the exchange to the screen.
 * Each term is a bound the pipeline enforces; `WORST_CASE_AGE_MS` is their sum and a test keeps it under the
 * 30s "live" cutoff with margin, so a healthy game never flickers to "Delayed".
 */
export const PIPELINE = {
  /** Worker polls every tick and writes a row every tick (no heartbeat gap). */
  tickMs: 10_000,
  /** Upstream latency plus the write inside one cycle. */
  cycleMs: 2_000,
  /** Book timestamp lag at the source when live (observed 0.1-2s). */
  bookMs: 2_000,
  /** In-process cache of the read API. */
  apiCacheMs: 3_000,
  /** CDN s-maxage on live responses (no stale-while-revalidate). */
  cdnMs: 3_000,
  /** Browser poll interval; the client counts age up between polls. */
  clientPollMs: 7_000,
} as const

export const WORST_CASE_AGE_MS = Object.values(PIPELINE).reduce((a, b) => a + b, 0)
