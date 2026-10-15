import { captureOpensAt, isUsMarketOpen, newYorkInstant, regularSession } from "./market-hours.ts"

/**
 * Which parts of the price cron have any work at `now`. DB-free and computed from the
 * America/New_York clock, so daylight saving needs no second schedule: the GitHub
 * workflow fires on a UTC superset and this decides.
 *
 *  - live: the regular session plus the few minutes of grace (live quotes, queued fantasy orders)
 *  - closeCapture: from 30 minutes after the close to 8pm, a trading day (official closes)
 *  - funds: 7pm-11pm on a trading day (fund NAVs)
 *  - morning: the 6:15am pass, every day (what the evening missed, weekends and holidays included)
 */
export function cronWindow(now: Date): { live: boolean; closeCapture: boolean; funds: boolean; morning: boolean; any: boolean } {
  const session = regularSession(now)
  const t = now.getTime()
  const live = isUsMarketOpen(now)
  const closeCapture = !!session && t >= captureOpensAt(session.date).getTime() && t < newYorkInstant(session.date, 20 * 60).getTime()
  const funds = !!session && t >= newYorkInstant(session.date, 19 * 60).getTime() && t < newYorkInstant(session.date, 23 * 60).getTime()
  const day = new Date(t - 4 * 3_600_000).toISOString().slice(0, 10)
  const morning = [day, new Date(t - 5 * 3_600_000).toISOString().slice(0, 10)].some(
    (date) => t >= newYorkInstant(date, 6 * 60 + 10).getTime() && t < newYorkInstant(date, 7 * 60).getTime(),
  )
  return { live, closeCapture, funds, morning, any: live || closeCapture || funds || morning }
}
