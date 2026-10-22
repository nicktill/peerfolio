/**
 * What to call at a given UTC minute. Pure, so it can be tested without a clock or a network.
 *
 * This reproduces, one for one, the schedules that used to live in .github/workflows (prices.yml, sports.yml, news.yml)
 * and apps/web/vercel.json (snapshot and news). GitHub and Cloudflare crons are UTC and know nothing of daylight saving,
 * so the same supersets are used: the routes themselves check the New York clock and answer at once outside their windows.
 */
export type JobName = "prices" | "news" | "snapshot" | "sports-settle" | "sports-publish" | "warm"

export type Job = { name: JobName; path: string }

const PATH: Record<Exclude<JobName, "warm">, string> = {
  prices: "/api/cron/prices",
  news: "/api/cron/news",
  snapshot: "/api/cron/snapshot",
  "sports-settle": "/api/cron/sports/settle",
  "sports-publish": "/api/cron/sports/publish",
}

/** Cloudflare numbers days 0-6 from Sunday, the same as cron: 1-5 is Monday to Friday. */
const weekdays = (dow: number) => dow >= 1 && dow <= 5

function pricesDue(min: number, hour: number, dow: number): boolean {
  // Match prices.yml's 15-minute UTC supersets, including the winter 19:30 ET close-capture attempt.
  // The app route applies the New York market calendar and six official-close windows.
  if (weekdays(dow) && hour >= 13 && hour <= 23 && min % 15 === 0) return true
  if (dow >= 2 && dow <= 6 && hour === 0 && min % 15 === 0) return true
  // Evening passes run at :01, inside the awake period the quarter-hour sports slot (:00) has just opened, so they add no database wake of their own.
  if (weekdays(dow) && hour === 23 && min === 1) return true // evening fund NAVs and close retries
  if (dow >= 2 && dow <= 6 && hour >= 0 && hour <= 4 && min === 1) return true // the same evening in US time, after midnight UTC
  if ((hour === 10 || hour === 11) && min === 15) return true // 6:15am New York, every day
  return false
}

const NEWS_SLOTS: [min: number, hours: number[]][] = [
  [0, [11, 12]], // 7:00am ET pre-market
  [15, [14, 15]], // 10:15am ET opening update
  [0, [16, 17]], // noon ET
  [15, [18, 19]], // 2:15pm ET afternoon update
  // The close recap is due at close + 20 minutes; :30 is the first quarter-hour slot after it, sharing that slot's database wake.
  [30, [20, 21]], // 4:30pm ET closing recap
  [30, [17, 18]], // 1:30pm ET early-close backup
  [0, [22]], // the Vercel cron's slot
]

function newsDue(min: number, hour: number, dow: number): boolean {
  return weekdays(dow) && NEWS_SLOTS.some(([m, hours]) => m === min && hours.includes(hour))
}

/** True on weekdays 9:30-16:05 New York time, when the News market cards are worth warming. */
export function marketHoursNewYork(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const day = get("weekday")
  if (day === "Sat" || day === "Sun") return false
  const hm = Number(get("hour")) * 100 + Number(get("minute"))
  return hm >= 930 && hm <= 1605
}

export type Options = { sports: boolean }

export function jobsFor(now: Date, { sports }: Options): Job[] {
  const min = now.getUTCMinutes()
  const hour = now.getUTCHours()
  const dow = now.getUTCDay()
  const jobs: Job[] = []
  const add = (name: Exclude<JobName, "warm">) => jobs.push({ name, path: PATH[name] })
  if (pricesDue(min, hour, dow)) {
    add("prices")
    if (marketHoursNewYork(now)) jobs.push({ name: "warm", path: "/api/news/market?part=board" }, { name: "warm", path: "/api/news/market?part=earnings" }, { name: "warm", path: "/api/news/market?part=fear-greed" }, { name: "warm", path: "/api/news" })
  }
  if (newsDue(min, hour, dow)) add("news")
  if (hour === 22 && min === 30) add("snapshot")
  if (sports && min % 15 === 0) add("sports-settle")
  if (sports && min % 15 === 0) add("sports-publish")
  return jobs
}
