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
