/**
 * Real numbers for the News page's market cards, from free sources:
 *
 * - Indexes and sectors: the ETFs that track them (SPY, QQQ, DIA, IWM and the
 *   eleven Select Sector SPDRs). Index levels themselves are licensed data;
 *   the funds' moves match the indexes to within a few hundredths of a percent.
 *   Today's move and price come from Finnhub's quote (consolidated prices,
 *   change against the official previous close); the week's move and the
 *   sparklines come from Alpaca's bars.
 * - Earnings: Finnhub's earnings calendar, biggest companies (by expected
 *   revenue) first.
 * - Fear & Greed: CNN's own reading, accepted only when it's well formed and
 *   recent. A card whose data is missing or stale is hidden, never guessed.
 *
 * Free of database and framework imports so the tests can stub `fetch`.
 */

import type { EarningsDay, EarningsReport, IndexQuote, SectorMove } from "./news-sample.ts"

type Fetch = (input: string, init?: RequestInit & { timeoutMs?: number }) => Promise<Response>

export const INDEX_FUNDS = [
  { key: "spx", name: "S&P 500", symbol: "SPY" },
  { key: "ndx", name: "Nasdaq 100", symbol: "QQQ" },
  { key: "dji", name: "Dow Jones", symbol: "DIA" },
  { key: "rut", name: "Russell 2000", symbol: "IWM" },
] as const

export const SECTOR_FUNDS = [
  { name: "Technology", symbol: "XLK" },
  { name: "Communication", symbol: "XLC" },
  { name: "Consumer disc.", symbol: "XLY" },
  { name: "Financials", symbol: "XLF" },
  { name: "Industrials", symbol: "XLI" },
  { name: "Health care", symbol: "XLV" },
  { name: "Materials", symbol: "XLB" },
  { name: "Utilities", symbol: "XLU" },
  { name: "Consumer staples", symbol: "XLP" },
  { name: "Real estate", symbol: "XLRE" },
  { name: "Energy", symbol: "XLE" },
] as const

const DAY = 86_400_000
const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places

/** A New York calendar date (YYYY-MM-DD) for an instant. */
export const nyDate = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(at)

/* ------------------------------------------------------------------ *
 * Indexes and sectors
 * ------------------------------------------------------------------ */

export type FinnhubQuote = { c: number; d: number; dp: number; pc: number; t: number }
export type Bar = { t: string; c: number }

export type MarketBoard = {
  indexes: IndexQuote[]
  /** [name, day %, week % or null when the bars are missing], best day first. */
  sectors: SectorMove[]
  /** The session the day's moves are for (YYYY-MM-DD, New York). */
  session: string
  asOf: string
}

/** A Finnhub quote, or null when it's empty, malformed or unknown (Finnhub answers those with zeros). */
export function parseQuote(body: unknown): FinnhubQuote | null {
  const q = body as Partial<Record<keyof FinnhubQuote, unknown>>
  const nums = [q?.c, q?.d, q?.dp, q?.pc, q?.t]
  if (!nums.every((v) => typeof v === "number" && Number.isFinite(v))) return null
  if (!((q.c as number) > 0) || !((q.pc as number) > 0) || !((q.t as number) > 0)) return null
  return { c: q.c as number, d: q.d as number, dp: q.dp as number, pc: q.pc as number, t: q.t as number }
}

/**
 * The week's move: from the close five sessions before the quote's session to
 * the quote's price, with the path through each close in between.
 */
export function weekMove(quote: FinnhubQuote, daily: Bar[]) {
  const session = nyDate(new Date(quote.t * 1000))
  const days = daily.map((b) => ({ date: nyDate(new Date(b.t)), c: b.c })).filter((b) => b.date < session)
  if (days.length < 5) return null
  const base = days[days.length - 5]!.c
  const closes = [...days.slice(-4).map((b) => b.c), quote.c]
  return {
    percent: round((quote.c / base - 1) * 100),
    points: round(quote.c - base),
    path: [0, ...closes.map((c) => round((c / base - 1) * 100, 3))],
  }
}

/** The day's move against the previous close, with the path through the session's bars. */
export function dayMove(quote: FinnhubQuote, intraday: Bar[]) {
  const session = nyDate(new Date(quote.t * 1000))
  const bars = intraday.filter((b) => nyDate(new Date(b.t)) === session)
  return {
    percent: round(quote.dp),
    points: round(quote.d),
    path: [0, ...bars.map((b) => round((b.c / quote.pc - 1) * 100, 3)), round(quote.dp, 3)],
  }
}

async function finnhubQuote(symbol: string, key: string, fetchImpl: Fetch) {
  try {
    const response = await fetchImpl(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, {
      headers: { "X-Finnhub-Token": key },
      cache: "no-store",
      timeoutMs: 6_000,
    })
    return response.ok ? parseQuote(await response.json()) : null
  } catch {
    return null
  }
}

async function alpacaBars(symbols: string[], timeframe: "1Day" | "15Min", start: Date, auth: { keyId: string; secret: string }, fetchImpl: Fetch) {
  const out = new Map<string, Bar[]>()
  let pageToken: string | null = null
  // Paged: one page usually covers everything, but never more than a few.
  for (let page = 0; page < 5; page++) {
    const url =
      `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbols.join(","))}&timeframe=${timeframe}` +
      `&start=${encodeURIComponent(start.toISOString())}&feed=iex&adjustment=all&limit=10000${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`
    const response = await fetchImpl(url, {
      headers: { "APCA-API-KEY-ID": auth.keyId, "APCA-API-SECRET-KEY": auth.secret },
      cache: "no-store",
      timeoutMs: 8_000,
    })
    if (!response.ok) throw new Error(`alpaca bars ${response.status}`)
    const body = (await response.json()) as { bars?: Record<string, { t?: unknown; c?: unknown }[]>; next_page_token?: string | null }
    for (const [symbol, bars] of Object.entries(body.bars ?? {})) {
      const clean = bars.filter((b): b is Bar => typeof b.t === "string" && typeof b.c === "number" && b.c > 0)
      out.set(symbol, [...(out.get(symbol) ?? []), ...clean])
    }
    pageToken = body.next_page_token ?? null
    if (!pageToken) break
  }
  return out
}

/**
 * Today's and this week's moves for the four index funds and eleven sector
 * funds. Null when there isn't enough to show honestly (no keys, or the quotes
 * didn't come back); a fund whose numbers are missing is left out.
 */
export async function fetchMarketBoard({
  finnhubKey,
  alpaca,
  fetchImpl,
  now = new Date(),
}: {
  finnhubKey: string | undefined
  alpaca: { keyId: string; secret: string } | null
  fetchImpl: Fetch
  now?: Date
}): Promise<MarketBoard | null> {
  if (!finnhubKey) return null
  const symbols = [...INDEX_FUNDS.map((f) => f.symbol), ...SECTOR_FUNDS.map((f) => f.symbol)]

  const quotes = new Map<string, FinnhubQuote>()
  // A few at a time, inside Finnhub's free allowance.
  for (let i = 0; i < symbols.length; i += 4) {
    const batch = symbols.slice(i, i + 4)
    const got = await Promise.all(batch.map((s) => finnhubQuote(s, finnhubKey, fetchImpl)))
    batch.forEach((s, j) => got[j] && quotes.set(s, got[j]!))
  }
  // A quote more than four days old means the source is stuck, not that it's a long weekend.
  for (const [s, q] of quotes) if (now.getTime() - q.t * 1000 > 4 * DAY) quotes.delete(s)
  if (INDEX_FUNDS.filter((f) => quotes.has(f.symbol)).length < 2) return null

  let daily = new Map<string, Bar[]>()
  let intraday = new Map<string, Bar[]>()
  if (alpaca) {
    const spy = quotes.get("SPY") ?? [...quotes.values()][0]!
    const sessionStart = new Date(spy.t * 1000 - 8 * 3_600_000)
    ;[daily, intraday] = await Promise.all([
      alpacaBars(symbols, "1Day", new Date(now.getTime() - 21 * DAY), alpaca, fetchImpl).catch(() => new Map<string, Bar[]>()),
      alpacaBars(INDEX_FUNDS.map((f) => f.symbol), "15Min", sessionStart, alpaca, fetchImpl).catch(() => new Map<string, Bar[]>()),
    ])
  }

  const indexes: IndexQuote[] = []
  for (const fund of INDEX_FUNDS) {
    const q = quotes.get(fund.symbol)
    if (!q) continue
    const day = dayMove(q, intraday.get(fund.symbol) ?? [])
    const week = weekMove(q, daily.get(fund.symbol) ?? [])
    indexes.push({ key: fund.key, name: fund.name, symbol: fund.symbol, price: q.c, day, week })
  }

  const sectors: SectorMove[] = []
  for (const fund of SECTOR_FUNDS) {
    const q = quotes.get(fund.symbol)
    if (!q) continue
    const week = weekMove(q, daily.get(fund.symbol) ?? [])
    sectors.push([fund.name, round(q.dp), week?.percent ?? null])
  }

  const spy = quotes.get("SPY") ?? quotes.get(indexes[0]!.symbol!)!
  return { indexes, sectors: sectors.sort((a, b) => b[1] - a[1]), session: nyDate(new Date(spy.t * 1000)), asOf: new Date(spy.t * 1000).toISOString() }
}

/* ------------------------------------------------------------------ *
 * Earnings
 * ------------------------------------------------------------------ */

/** Monday to Friday of the week to show: this week, or next week from Saturday on. */
export function earningsWeekDates(now: Date): string[] {
  const today = new Date(`${nyDate(now)}T12:00:00Z`)
  const dow = today.getUTCDay() // 0 Sunday
  const monday = new Date(today.getTime() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow) * DAY)
  return Array.from({ length: 5 }, (_, i) => new Date(monday.getTime() + i * DAY).toISOString().slice(0, 10))
}

type CalendarRow = { date?: unknown; symbol?: unknown; hour?: unknown; epsEstimate?: unknown; revenueEstimate?: unknown }

const SYMBOL = /^[A-Z]{1,5}$/
const WHEN: Record<string, EarningsReport["when"]> = { bmo: "before-open", amc: "after-close", dmh: "during" }
const eps = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`

/**
 * Finnhub's calendar rows grouped into the week's days, each day's companies
 * ordered by expected revenue (a stand-in for size, which the calendar lacks)
 * and capped. Owned flags are filled in by the page, which knows your holdings.
 */
export function buildEarningsWeek(rows: CalendarRow[], dates: string[], today: string, names: Map<string, string>, perDay = 30): EarningsDay[] {
  return dates.map((date) => {
    const d = new Date(`${date}T12:00:00Z`)
    const reports = rows
      .filter((r) => r.date === date && typeof r.symbol === "string" && SYMBOL.test(r.symbol))
      .sort((a, b) => (Number(b.revenueEstimate) || 0) - (Number(a.revenueEstimate) || 0))
      .slice(0, perDay)
      .map((r) => ({
        symbol: r.symbol as string,
        name: names.get(r.symbol as string) ?? "",
        when: WHEN[String(r.hour)] ?? "unknown",
        epsEstimate: typeof r.epsEstimate === "number" && Number.isFinite(r.epsEstimate) ? eps(r.epsEstimate) : "—",
        owned: false,
      }))
    return {
      dow: date === today ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      label: `${date === today ? "Today" : d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
      date: d.getUTCDate(),
      iso: date,
      past: date < today,
      today: date === today,
      reports,
    }
  })
}

export type EarningsWeekData = { label: string; days: EarningsDay[]; asOf: string }

/** The week's earnings calendar, or null when it can't be fetched. */
export async function fetchEarningsWeek({
  finnhubKey,
  fetchImpl,
  knownNames,
  now = new Date(),
}: {
  finnhubKey: string | undefined
  fetchImpl: Fetch
  /** Company names we already have, by ticker, so few need looking up. */
  knownNames: (symbols: string[]) => Promise<Map<string, string>>
  now?: Date
}): Promise<EarningsWeekData | null> {
  if (!finnhubKey) return null
  const dates = earningsWeekDates(now)
  const response = await fetchImpl(`https://finnhub.io/api/v1/calendar/earnings?from=${dates[0]}&to=${dates[4]}`, {
    headers: { "X-Finnhub-Token": finnhubKey },
    cache: "no-store",
    timeoutMs: 10_000,
  })
  if (!response.ok) return null
  const body = (await response.json()) as { earningsCalendar?: CalendarRow[] }
  if (!Array.isArray(body.earningsCalendar)) return null

  const days = buildEarningsWeek(body.earningsCalendar, dates, nyDate(now), new Map())
  // Names for the companies most likely to be shown: ours first, then Finnhub's profile for a few more.
  const top = [...new Set(days.flatMap((d) => d.reports.slice(0, 6).map((r) => r.symbol)))]
  const names = await knownNames(days.flatMap((d) => d.reports.map((r) => r.symbol))).catch(() => new Map<string, string>())
  const missing = top.filter((s) => !names.has(s)).slice(0, 20)
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (symbol) => {
        try {
          const r = await fetchImpl(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}`, { headers: { "X-Finnhub-Token": finnhubKey }, cache: "no-store", timeoutMs: 5_000 })
          const profile = r.ok ? ((await r.json()) as { name?: unknown }) : null
          if (typeof profile?.name === "string" && profile.name.trim()) names.set(symbol, profile.name.trim())
        } catch {
          // A name is a nicety; the ticker still shows.
        }
      }),
    )
  }
  for (const d of days) for (const r of d.reports) r.name = names.get(r.symbol) ?? ""

  const monday = new Date(`${dates[0]}T12:00:00Z`)
  return { label: `Week of ${monday.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`, days, asOf: now.toISOString() }
}

/* ------------------------------------------------------------------ *
 * Fear & Greed
 * ------------------------------------------------------------------ */

export type FearGreedReading = { score: number; rating: string; asOf: string; history: { label: string; score: number }[] }

export const CNN_FEAR_GREED_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
export const CNN_FEAR_GREED_PAGE = "https://www.cnn.com/markets/fear-and-greed"

const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100

/**
 * CNN's reading, or null unless it's a 0–100 score stamped within the last four
 * days (a weekend plus a holiday). Better no card than an old or garbled number.
 */
export function parseFearGreed(body: unknown, now: Date): FearGreedReading | null {
  const fg = (body as { fear_and_greed?: Record<string, unknown> } | null)?.fear_and_greed
  if (!fg || !valid(fg.score) || typeof fg.timestamp !== "string") return null
  const asOf = new Date(fg.timestamp)
  if (Number.isNaN(asOf.getTime()) || now.getTime() - asOf.getTime() > 4 * DAY || asOf.getTime() - now.getTime() > DAY) return null
  const past: [string, unknown][] = [
    ["Previous close", fg.previous_close],
    ["1 week ago", fg.previous_1_week],
    ["1 month ago", fg.previous_1_month],
    ["1 year ago", fg.previous_1_year],
  ]
  const history = past.flatMap(([label, score]) => (valid(score) ? [{ label, score: Math.round(score) }] : []))
  return { score: Math.round(fg.score), rating: typeof fg.rating === "string" ? fg.rating : "", asOf: asOf.toISOString(), history }
}

export async function fetchFearGreed(fetchImpl: typeof fetch, now = new Date()): Promise<FearGreedReading | null> {
  try {
    const response = await fetchImpl(CNN_FEAR_GREED_URL, {
      headers: {
        // CNN serves this to its own page; a plain script user agent is refused.
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        accept: "application/json",
        referer: "https://www.cnn.com/",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    })
    return response.ok ? parseFearGreed(await response.json(), now) : null
  } catch {
    return null
  }
}
