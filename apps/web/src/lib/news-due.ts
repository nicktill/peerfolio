import { briefTargets, briefingNeedsRefresh, briefingSlot } from "./news-brief.ts"

/**
 * What the visit-time "is the news job due?" check needs, read in one go and kept in the shared data cache
 * until the job writes (every write revalidates the news tag). Dates are ISO strings so the entry survives
 * the cache's JSON round trip. Kept free of the database client so the tests can import it.
 */
export type NewsStatus = {
  /** Newest `fetched_at` across stored headlines, or null when there are none. */
  fetchedAt: string | null
  /** Recent `period_end` dates that have a daily recap. */
  day: string[]
  /** Recent `period_end` dates that have a weekly recap. */
  week: string[]
  /** Recent intraday briefings: the trading date each covers and when it was written. */
  midday: { periodEnd: string; createdAt: string }[]
}

/**
 * The same rules the live queries applied: headlines older than `staleMs`, an intraday briefing slot that
 * has passed since the stored one was written, or a missing daily or weekly recap.
 */
export function newsDueFromStatus(status: NewsStatus, now: Date, staleMs: number): boolean {
  if (!status.fetchedAt || now.getTime() - Date.parse(status.fetchedAt) > staleMs) return true
  const slot = briefingSlot(now)
  if (slot?.period === "midday") {
    const current = status.midday.find((m) => m.periodEnd === slot.date)
    if (briefingNeedsRefresh(current ? new Date(current.createdAt) : null, slot)) return true
  }
  const targets = briefTargets(now)
  if (targets.day && !status.day.includes(targets.day)) return true
  if (targets.week && !status.week.includes(targets.week)) return true
  return false
}
