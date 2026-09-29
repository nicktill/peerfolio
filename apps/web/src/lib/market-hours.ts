/**
 * When the US stock market's regular session is open. No imports, so both the
 * server (deciding whether to fetch live prices) and the browser (deciding how
 * often to re-read them) can use it.
 */

const OPEN_MINUTE = 9 * 60 + 30
/** A few minutes past 4pm ET so the closing print is caught. */
const CLOSE_MINUTE = 16 * 60 + 5

/**
 * Whether the US stock market's regular session is (about) open, in New York
 * time so daylight saving takes care of itself. Holidays are not listed here;
 * `acceptQuote` rejects the stale prices a holiday produces.
 */
export function isUsMarketOpen(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return false
  const minutes = Number(get("hour")) * 60 + Number(get("minute"))
  return minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE
}

/**
 * The most recent US trading day whose closing bar should exist by `now`:
 * today once it is past 4:30pm New York time on a weekday, otherwise the
 * previous weekday. Holidays aren't listed, so on one this names a day the
 * market never traded; callers only use it to decide whether a newer close is
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
