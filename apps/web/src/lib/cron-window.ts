import { isUsMarketOpen, newYorkInstant, regularSession, sessionCloseAt } from "./market-hours.ts"

/**
 * Which parts of the price cron have any work at `now`. DB-free and computed from the
 * America/New_York clock, so daylight saving needs no second schedule: the GitHub
 * workflow fires on a UTC superset and this decides.
 *
 *  - live: the regular session plus the few minutes of grace (live quotes, queued fantasy orders)
 *  - closeCapture: a few attempts, not a poll, from 30 minutes after the close to 8pm on a trading day (official closes). Each attempt
 *    wakes the database, so they follow CAPTURE_LADDER_MINUTES; the 6:30pm snapshot and the 6:15am pass catch anything later
 *  - funds: 7pm-11pm on a trading day (fund NAVs)
 *  - morning: the 6:15am pass, every day (what the evening missed, weekends and holidays included)
 */
/** Minutes after the close at which an official-close attempt is made; each opens a CAPTURE_STEP_MINUTES window so one scheduled run lands in it. Every start sits on a quarter-hour mark, the same marks the 15-minute workflow ticks use (cron-workflow.test.ts checks this). */
export const CAPTURE_LADDER_MINUTES = [45, 75, 90, 120, 165, 210]
export const CAPTURE_STEP_MINUTES = 15

export function cronWindow(now: Date): { live: boolean; closeCapture: boolean; funds: boolean; morning: boolean; any: boolean } {
  const session = regularSession(now)
  const t = now.getTime()
  const live = isUsMarketOpen(now)
  const closeAt = session ? sessionCloseAt(session.date).getTime() : 0
  const closeCapture = !!session && t < newYorkInstant(session.date, 20 * 60).getTime() && CAPTURE_LADDER_MINUTES.some((m) => t >= closeAt + m * 60_000 && t < closeAt + (m + CAPTURE_STEP_MINUTES) * 60_000)
  const funds = !!session && t >= newYorkInstant(session.date, 19 * 60).getTime() && t < newYorkInstant(session.date, 23 * 60).getTime()
  const day = new Date(t - 4 * 3_600_000).toISOString().slice(0, 10)
  const morning = [day, new Date(t - 5 * 3_600_000).toISOString().slice(0, 10)].some(
    (date) => t >= newYorkInstant(date, 6 * 60 + 10).getTime() && t < newYorkInstant(date, 7 * 60).getTime(),
  )
  return { live, closeCapture, funds, morning, any: live || closeCapture || funds || morning }
}
