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

// ---------------------------------------------------------------------------
// Event log: one row per non-success request, kept 14 days. Public market data
// only: a path with no query string, up to five tickers, a short reason. Never a
// URL with its query, a header, a key or a token.
// ---------------------------------------------------------------------------

export const EVENT_KINDS = ["denied", "rate_limited", "failed", "timeout"] as const
export type EventKind = (typeof EVENT_KINDS)[number]
export const isEventKind = (value: string | null): value is EventKind => value != null && (EVENT_KINDS as readonly string[]).includes(value)

export const EVENT_KEEP_DAYS = 14
export const REASON_MAX = 200
export const SAMPLE_MAX = 5
/** Events one process writes per provider per minute; the rest are counted, not stored. */
export const EVENTS_PER_MINUTE = 20

/** What gets stored for one non-success request. */
export type NewProviderEvent = {
  provider: string
  kind: EventKind
  httpStatus: number | null
  endpoint: string
  symbolsCount: number
  symbolsSample: string
  reason: string
  waitSeconds: number | null
  caller: string | null
  /** Events this process skipped (over the per-minute cap) since its last written one for this provider. */
  suppressed: number
}

/** An event as the admin API returns it. */
export type ProviderEventRow = Omit<NewProviderEvent, "symbolsSample"> & { id: number; at: string; symbolsSample: string[] }

export type ReasonCount = { provider: string; kind: EventKind; httpStatus: number | null; reason: string; count: number; last: string }

export type EventsResponse = {
  from: string
  to: string
  events: ProviderEventRow[]
  /** Counts by kind over the window, before the provider/kind filters. */
  totals: Record<EventKind, number>
  reasons: ReasonCount[]
  /** More matching events exist than were returned. */
  more: boolean
}

const TICKER = /^[A-Za-z0-9][A-Za-z0-9.:\-/]{0,11}$/

const parseUrl = (input: RequestInfo | URL): URL | null => {
  try {
    return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  } catch {
    return null
  }
}

/** The request's path only, with any long opaque segment masked in case something secret sits in one. */
export function endpointOf(input: RequestInfo | URL): string {
  const url = parseUrl(input)
  if (!url) return "(unknown)"
  return url.pathname.replace(/[A-Za-z0-9_-]{28,}/g, ":id") || "/"
}

/** Up to five tickers the request names, from `symbols`/`symbol` or a ticker path segment. */
export function symbolsSampleOf(input: RequestInfo | URL): string[] {
  const url = parseUrl(input)
  if (!url) return []
  const fromQuery = (url.searchParams.get("symbols") ?? url.searchParams.get("symbol") ?? "").split(",")
  const segments = url.pathname.split("/")
  const at = segments.findIndex((s) => s === "ticker" || s === "tickers" || s === "daily")
  const fromPath = at >= 0 && segments[at + 1] ? [segments[at + 1]!] : []
  const out: string[] = []
  for (const raw of [...fromQuery, ...fromPath]) {
    let symbol = raw.trim()
    try {
      symbol = decodeURIComponent(symbol)
    } catch {
      // keep it as written; the pattern below decides
    }
    symbol = symbol.toUpperCase()
    if (TICKER.test(symbol) && !out.includes(symbol)) out.push(symbol)
    if (out.length >= SAMPLE_MAX) break
  }
  return out
}

export const truncate = (text: string, max = REASON_MAX) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Strips anything shaped like a credential from text we are about to store. */
const scrub = (text: string) =>
  text
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer …")
    .replace(/((?:api[_-]?key|apikey|token|secret|authorization|password)["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi, "$1…")

/** A short reason from an error response's body: its message field if it is JSON, else its text. */
export function reasonFromBody(body: string | undefined, fallback = ""): string {
  const text = (body ?? "").trim()
  if (!text) return truncate(fallback)
  let picked = ""
  try {
    const json: unknown = JSON.parse(text)
    const pick = (value: unknown): string => {
      if (typeof value === "string") return value
      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>
        for (const key of ["message", "error", "error_description", "detail", "status"]) {
          const found = record[key] !== undefined ? pick(record[key]) : ""
          if (found) return found
        }
      }
      return ""
    }
    picked = pick(json)
  } catch {
    // not JSON
  }
  const flat = (picked || (text.startsWith("<") ? "" : text)).replace(/\s+/g, " ").trim()
  return truncate(scrub(flat || fallback))
}

/** What a thrown fetch error becomes: a timeout, or a failure named by error type and network code. No message text. */
export function classifyError(error: unknown): { kind: "timeout" | "failed"; reason: string } {
  const name = error instanceof Error ? error.name : "Error"
  if (name === "TimeoutError" || name === "AbortError") return { kind: "timeout", reason: name === "TimeoutError" ? "request timed out" : "request aborted" }
  const cause = error instanceof Error ? (error as { cause?: { code?: unknown } }).cause : undefined
  const code = typeof cause?.code === "string" ? cause.code : ""
  return { kind: "failed", reason: truncate(`${name}: network error${code ? ` (${code})` : ""}`) }
}

/**
 * The row to store for a non-success request. `body` is the (already read) error
 * response text, if any. Pure, so the tests can check what is and isn't stored.
 */
export function buildEvent(args: {
  provider: string
  kind: EventKind
  input: RequestInfo | URL
  status?: number | null
  reason?: string
  body?: string
  waitSeconds?: number | null
  caller?: string | null
  suppressed?: number
}): NewProviderEvent {
  return {
    provider: args.provider,
    kind: args.kind,
    httpStatus: args.status ?? null,
    endpoint: endpointOf(args.input),
    symbolsCount: symbolCount(args.input),
    symbolsSample: symbolsSampleOf(args.input).join(","),
    reason: args.reason != null ? truncate(scrub(args.reason)) : reasonFromBody(args.body, args.status ? `HTTP ${args.status}` : "unknown"),
    waitSeconds: args.waitSeconds != null && Number.isFinite(args.waitSeconds) ? Math.max(0, Math.ceil(args.waitSeconds)) : null,
    caller: args.caller ?? null,
    suppressed: args.suppressed ?? 0,
  }
}

/**
 * Caps how many events a process writes per provider per minute, so an outage
 * can't flood the table. Over the cap, events are counted; the next one written
 * carries the count as `suppressed`.
 */
export function createEventLimiter({ perMinute = EVENTS_PER_MINUTE }: { perMinute?: number } = {}) {
  const state = new Map<string, { minute: number; written: number; skipped: number }>()
  return {
    admit(provider: string, now = Date.now()): { write: boolean; suppressed: number } {
      const minute = Math.floor(now / 60_000)
      const s = state.get(provider) ?? { minute, written: 0, skipped: 0 }
      if (s.minute !== minute) {
        s.minute = minute
        s.written = 0
      }
      state.set(provider, s)
      if (s.written >= perMinute) {
        s.skipped++
        return { write: false, suppressed: 0 }
      }
      s.written++
      const suppressed = s.skipped
      s.skipped = 0
      return { write: true, suppressed }
    },
  }
}

/** Groups events by what went wrong, most frequent first; numbers in a reason (waits, counts) are ignored when grouping. */
export function groupReasons(events: Pick<ProviderEventRow, "provider" | "kind" | "httpStatus" | "reason" | "at">[], limit = 12): ReasonCount[] {
  const groups = new Map<string, ReasonCount>()
  for (const e of events) {
    const reason = e.reason.replace(/\d+/g, "N")
    const key = [e.provider, e.kind, e.httpStatus ?? "", reason].join("\u0000")
    const g = groups.get(key)
    if (!g) groups.set(key, { provider: e.provider, kind: e.kind, httpStatus: e.httpStatus, reason: e.reason, count: 1, last: e.at })
    else {
      g.count++
      if (e.at > g.last) {
        g.last = e.at
        g.reason = e.reason
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1)).slice(0, limit)
}

/**
 * Free-plan allowances and what we let ourselves use of them: at most `burst +
 * perMinute` in any minute, below each allowance. Massive allows only 5 a minute, so
 * at most 4: two at once, then one every 30 seconds. Tiingo allows 50 an hour and
 * 1,000 a day; 40 an hour plus a burst of 5 stays under both.
 */
export const BUDGET_DEFAULTS: Record<"finnhub" | "alpaca" | "massive" | "tiingo", { perMinute: number; burst: number }> = {
  finnhub: { perMinute: 40, burst: 5 }, // allows 60 a minute
  alpaca: { perMinute: 150, burst: 10 }, // allows 200 a minute
  massive: { perMinute: 2, burst: 2 }, // allows 5 a minute
  tiingo: { perMinute: 40 / 60, burst: 5 }, // allows 50 an hour, 1,000 a day
}
