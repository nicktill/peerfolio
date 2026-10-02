/**
 * When the US stock market's regular session is open. No imports, so both the
 * server (deciding whether to fetch live prices) and the browser (deciding how
 * often to re-read them) can use it.
 */

const OPEN_MINUTE = 9 * 60 + 30
const CLOSE_MINUTE = 16 * 60
const EARLY_CLOSE_MINUTE = 13 * 60
/** Live refreshes keep going a few minutes past the close so the closing print is caught. */
const REFRESH_GRACE_MINUTES = 5

/**
 * NYSE full-day closures. Extend this each year from
 * https://www.nyse.com/markets/hours-calendars. A missing date only means the
 * app expects a session that never comes: no quote is printed, so nothing
 * fills (see `isSessionPrint`), and orders wait.
 */
const HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
  "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
])

/** Days the regular session ends at 1pm ET. */
const EARLY_CLOSES = new Set(["2025-07-03", "2025-11-28", "2025-12-24", "2026-11-27", "2026-12-24", "2027-11-26"])

const nyFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
})

/** `at` on the New York calendar and clock, so daylight saving takes care of itself. */
function newYork(at: Date) {
  const parts = nyFormat.formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekend: get("weekday") === "Sat" || get("weekday") === "Sun",
    minutes: Number(get("hour")) * 60 + Number(get("minute")) + Number(get("second")) / 60,
  }
}

/** The regular session on `at`'s New York date as minutes after midnight, or null when the market doesn't open that day. */
export function regularSession(at: Date): { date: string; open: number; close: number } | null {
  const ny = newYork(at)
  if (ny.weekend || HOLIDAYS.has(ny.date)) return null
  return { date: ny.date, open: OPEN_MINUTE, close: EARLY_CLOSES.has(ny.date) ? EARLY_CLOSE_MINUTE : CLOSE_MINUTE }
}

/**
 * Whether the regular session is open right now, to the minute: weekends,
 * holidays and early closes included. Stock trades fill only inside it; outside
 * it, the price people can see elsewhere has moved on from anything we have.
 */
export function isTradingSession(now: Date): boolean {
  const session = regularSession(now)
  if (!session) return false
  const { minutes } = newYork(now)
  return minutes >= session.open && minutes < session.close
}

/**
 * Whether live prices are worth fetching: the regular session plus a few
 * minutes after its close, so the closing print is caught.
 */
export function isUsMarketOpen(now: Date): boolean {
  const session = regularSession(now)
  if (!session) return false
  const { minutes } = newYork(now)
  return minutes >= session.open && minutes < session.close + REFRESH_GRACE_MINUTES
}

/**
 * Whether a trade printed at `at` happened in a regular session (the closing
 * print, stamped a moment after the bell, included). Pre-market and after-hours
 * prints are not: they come from thin extended-hours trading, and a price from
 * one of them is exactly the "stale versus what's moving elsewhere" gap that
 * lets someone trade on information the app doesn't have.
 */
export function isSessionPrint(at: Date): boolean {
  const session = regularSession(at)
  if (!session) return false
  const { minutes } = newYork(at)
  return minutes >= session.open && minutes <= session.close + 1
}

/**
 * The most recent US trading day whose closing bar should exist by `now`:
 * today once it is past 4:30pm New York time on a weekday, otherwise the
 * previous weekday. Holidays are deliberately ignored here, so on one this
 * names a day the market never traded; callers only use it to decide whether a newer close is
 * worth looking for, and finding none is a normal answer.
 */
export function latestCompletedSession(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const minutes = get("hour") * 60 + get("minute")

  // Work in UTC on the New York calendar date so day arithmetic ignores time zones.
  const day = new Date(Date.UTC(get("year"), get("month") - 1, get("day")))
  const isWeekend = () => day.getUTCDay() === 0 || day.getUTCDay() === 6
  if (isWeekend() || minutes < 16 * 60 + 30) day.setUTCDate(day.getUTCDate() - 1)
  while (isWeekend()) day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}
