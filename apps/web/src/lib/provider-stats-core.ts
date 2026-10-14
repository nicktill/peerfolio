/**
 * Pure helpers behind the provider request counters: how many symbols a request
 * carried, and how per-minute rows roll up into days, a peak minute and the
 * current hour. Free of database imports so the tests can run it directly.
 */

export type StatRow = {
  provider: string
  minute: Date
  requests: number
  symbols: number
  denied: number
  rateLimited: number
  failed: number
}

export type StatDay = Omit<StatRow, "provider" | "minute"> & { date: string }

export type ProviderSummary = {
  provider: string
  /** Oldest first, one entry per UTC day, including days with no traffic. */
  days: StatDay[]
  peak: { requests: number; minute: string | null }
  currentHour: { requests: number; denied: number; budget: number | null }
  totals: Omit<StatRow, "provider" | "minute">
}

/** Tickers one request carries: the comma-separated `symbols` parameter, else 1. */
export function symbolCount(input: RequestInfo | URL): number {
  try {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const list = url.searchParams.get("symbols")
    if (!list) return 1
    return Math.max(1, list.split(",").filter(Boolean).length)
  } catch {
    return 1
  }
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const empty = () => ({ requests: 0, symbols: 0, denied: 0, rateLimited: 0, failed: 0 })

/**
 * Rolls per-minute rows up per provider over the last `days` UTC days ending at
 * `now`. `hourlyBudgets` is what we allow ourselves an hour, per provider.
 */
export function summarize(
  rows: StatRow[],
  { now = new Date(), days = 7, hourlyBudgets = {} }: { now?: Date; days?: number; hourlyBudgets?: Record<string, number> } = {},
): ProviderSummary[] {
  const dates = Array.from({ length: days }, (_, i) => dayKey(new Date(now.getTime() - (days - 1 - i) * 86_400_000)))
  const hourAgo = now.getTime() - 3_600_000
  const byProvider = new Map<string, StatRow[]>()
  for (const row of rows) byProvider.set(row.provider, [...(byProvider.get(row.provider) ?? []), row])

  return [...byProvider.keys()].sort().map((provider) => {
    const mine = byProvider.get(provider)!
    const perDay = new Map(dates.map((date) => [date, { date, ...empty() }]))
    const totals = empty()
    const hour = { requests: 0, denied: 0 }
    let peak: ProviderSummary["peak"] = { requests: 0, minute: null }

    for (const row of mine) {
      const day = perDay.get(dayKey(row.minute))
      if (!day) continue
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
        day[key] += row[key]
        totals[key] += row[key]
      }
      if (row.requests > peak.requests) peak = { requests: row.requests, minute: row.minute.toISOString() }
      if (row.minute.getTime() > hourAgo && row.minute.getTime() <= now.getTime()) {
        hour.requests += row.requests
        hour.denied += row.denied
      }
    }
    return { provider, days: [...perDay.values()], peak, currentHour: { ...hour, budget: hourlyBudgets[provider] ?? null }, totals }
  })
}

/** What each provider allows on the plan we use; the dashboard draws these as reference lines. */
export const PROVIDER_LIMITS: Record<string, { amount: number; per: "minute" | "hour" }> = {
  alpaca: { amount: 200, per: "minute" },
  finnhub: { amount: 60, per: "minute" },
  massive: { amount: 5, per: "minute" },
  tiingo: { amount: 50, per: "hour" },
}

export const WARN_RATIO = 0.8

export const RANGES = {
  "6h": { ms: 6 * 3_600_000, bucketMinutes: 5 },
  "24h": { ms: 24 * 3_600_000, bucketMinutes: 15 },
  "7d": { ms: 7 * 86_400_000, bucketMinutes: 60 },
  "30d": { ms: 30 * 86_400_000, bucketMinutes: 360 },
} as const
export type RangeKey = keyof typeof RANGES
export const isRange = (value: string | null): value is RangeKey => value != null && value in RANGES

export type SeriesPoint = { t: string; /** Peak per the provider's limit unit within the bucket. */ value: number; requests: number; symbols: number }

export type ProviderDashboard = {
  provider: string
  limit: { amount: number; per: "minute" | "hour" }
  series: SeriesPoint[]
  /** One entry per UTC day over the range (at least 7 days), oldest first. */
  days: StatDay[]
  peak: { value: number; at: string | null }
  peakRatio: number
  lastHour: { requests: number; denied: number }
  hourBudget: number | null
  lastHourRatio: number | null
  today: { requests: number; symbols: number }
  totals: Omit<StatRow, "provider" | "minute">
  warn: boolean
}

export type Dashboard = { range: RangeKey; from: string; to: string; bucketMinutes: number; hasData: boolean; providers: ProviderDashboard[] }

/**
 * Everything the admin dashboard shows, from per-minute rows: a series per
 * provider (peak requests per its limit's unit, per bucket), daily totals, the
 * peak against the real limit, and the last hour against our own budget.
 * `hourlyBudgets` is what we allow ourselves an hour, per provider.
 */
export function buildDashboard(
  rows: StatRow[],
  { now = new Date(), range = "24h", hourlyBudgets = {} }: { now?: Date; range?: RangeKey; hourlyBudgets?: Record<string, number> } = {},
): Dashboard {
  const { ms, bucketMinutes } = RANGES[range]
  const bucketMs = bucketMinutes * 60_000
  const to = now.getTime()
  const from = to - ms
  const todayStart = Date.parse(dayKey(now))
  const hourAgo = to - 3_600_000
  const dayCount = Math.max(7, Math.ceil(ms / 86_400_000))
  const names = [...new Set([...Object.keys(PROVIDER_LIMITS), ...rows.map((r) => r.provider)])]
  const firstBucket = Math.floor(from / bucketMs) * bucketMs

  const providers = names.map((provider): ProviderDashboard => {
    const limit = PROVIDER_LIMITS[provider] ?? { amount: Infinity, per: "minute" as const }
    const mine = rows.filter((r) => r.provider === provider)

    // Per-unit totals: a minute's rows are already per minute; hourly limits sum a clock hour.
    const unitMs = limit.per === "hour" ? 3_600_000 : 60_000
    const perUnit = new Map<number, number>()
    for (const row of mine) {
      const t = row.minute.getTime()
      if (t < from || t > to) continue
      const key = Math.floor(t / unitMs) * unitMs
      perUnit.set(key, (perUnit.get(key) ?? 0) + row.requests)
    }

    const buckets = new Map<number, SeriesPoint>()
    for (let b = firstBucket; b <= to; b += bucketMs) buckets.set(b, { t: new Date(b).toISOString(), value: 0, requests: 0, symbols: 0 })
    const bucketOf = (t: number) => buckets.get(Math.floor(t / bucketMs) * bucketMs)

    const totals = { requests: 0, symbols: 0, denied: 0, rateLimited: 0, failed: 0 }
    const today = { requests: 0, symbols: 0 }
    const lastHour = { requests: 0, denied: 0 }
    const dayRows = new Map<string, StatDay>()
    for (let i = dayCount - 1; i >= 0; i--) {
      const date = dayKey(new Date(to - i * 86_400_000))
      dayRows.set(date, { date, requests: 0, symbols: 0, denied: 0, rateLimited: 0, failed: 0 })
    }

    for (const row of mine) {
      const t = row.minute.getTime()
      if (t > to) continue
      const day = dayRows.get(dayKey(row.minute))
      if (day) {
        day.requests += row.requests
        day.symbols += row.symbols
        day.denied += row.denied
        day.rateLimited += row.rateLimited
        day.failed += row.failed
      }
      if (t >= todayStart) {
        today.requests += row.requests
        today.symbols += row.symbols
      }
      if (t > hourAgo) {
        lastHour.requests += row.requests
        lastHour.denied += row.denied
      }
      if (t < from) continue
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += row[key]
      const point = bucketOf(t)
      if (point) {
        point.requests += row.requests
        point.symbols += row.symbols
      }
    }

    let peak = { value: 0, at: null as string | null }
    for (const [key, value] of perUnit) {
      const point = bucketOf(key)
      if (point && value > point.value) point.value = value
      if (value > peak.value) peak = { value, at: new Date(key).toISOString() }
    }

    const budget = hourlyBudgets[provider] ?? null
    const peakRatio = Number.isFinite(limit.amount) ? peak.value / limit.amount : 0
    return {
      provider,
      limit,
      series: [...buckets.values()],
      days: [...dayRows.values()],
      peak,
      peakRatio,
      lastHour,
      hourBudget: budget,
      lastHourRatio: budget ? lastHour.requests / budget : null,
      today,
      totals,
      warn: peakRatio > WARN_RATIO,
    }
  })

  return { range, from: new Date(from).toISOString(), to: now.toISOString(), bucketMinutes, hasData: rows.length > 0, providers }
}
