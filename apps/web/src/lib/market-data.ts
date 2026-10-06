/**
 * End-of-day prices from Massive (formerly Polygon.io).
 *
 * The nightly job asks for the whole market's daily bars in one request per
 * asset class rather than one request per ticker, so the call count stays flat
 * no matter how many people or positions there are.
 *
 * Free of database imports so the tests can exercise it with a stubbed fetch.
 */

import { providerFetch } from "./provider-fetch.ts"

const BASE_URL = process.env.MASSIVE_BASE_URL ?? "https://api.massive.com"

/** Every Massive request spends from its shared budget (see provider-fetch.ts). */
export const massiveFetch = providerFetch("massive")

/** How far back to look for a trading day: covers a weekend plus a holiday. */
const MAX_LOOKBACK_DAYS = 5

export type AssetKind = "stock" | "crypto"

export type Close = { price: number; asOf: string }

export class MarketDataError extends Error {
  // Assigned by hand: the tests run with type stripping, which can't compile
  // parameter properties.
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

/**
 * The provider's ticker for what someone typed, or null if it can't be one.
 * Stocks and ETFs share a namespace; crypto is quoted against USD.
 */
export function toMarketTicker(symbol: string, kind: AssetKind): string | null {
  const s = symbol.trim().toUpperCase()

  if (kind === "crypto") {
    return /^[A-Z0-9]{2,10}$/.test(s) ? `X:${s}USD` : null
  }

  // Brokerages write share classes as BRK.B, BRK-B or BRK/B; Massive uses dots.
  const normalized = s.replace(/[-/]/g, ".")
  return /^[A-Z][A-Z0-9]{0,5}(\.[A-Z0-9]{1,2})?$/.test(normalized) ? normalized : null
}

/** What to show for a market ticker: `X:BTCUSD` reads as `BTC`. */
export function displaySymbol(marketTicker: string): string {
  return marketTicker.startsWith("X:") ? marketTicker.slice(2).replace(/USD$/, "") : marketTicker
}

const isCrypto = (marketTicker: string) => marketTicker.startsWith("X:")

type Bar = { T?: string; c?: number; t?: number }
type AggsResponse = { resultsCount?: number; results?: Bar[] }

async function get(path: string, fetchImpl: typeof fetch): Promise<AggsResponse> {
  return getJson<AggsResponse>(path, fetchImpl)
}

async function getJson<T>(path: string, fetchImpl: typeof fetch): Promise<T> {
  const key = process.env.MASSIVE_API_KEY
  if (!key) throw new MarketDataError("MASSIVE_API_KEY is not set")

  const response = await fetchImpl(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  })

  if (!response.ok) throw new MarketDataError(`Market data request failed (${response.status})`, response.status)
  return (await response.json()) as T
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Most recent completed daily close for one ticker, or null if it doesn't trade. */
export async function previousClose(marketTicker: string, fetchImpl: typeof fetch = massiveFetch): Promise<Close | null> {
  const data = await get(`/v2/aggs/ticker/${encodeURIComponent(marketTicker)}/prev?adjusted=true`, fetchImpl)
  const bar = data.results?.[0]
  if (!bar || typeof bar.c !== "number" || typeof bar.t !== "number") return null
  return { price: bar.c, asOf: isoDate(bar.t) }
}

/**
 * Whether a fetched close may replace the stored one. Prices only ever move
 * forward in time: `/prev` can lag the nightly whole-market bars by a day, and
 * letting it overwrite them would silently move everyone's valuation backwards.
 */
export function isNewerClose(incomingAsOf: string, storedAsOf: string | null | undefined): boolean {
  return !storedAsOf || incomingAsOf.slice(0, 10) >= storedAsOf.slice(0, 10)
}

/** US stocks have printed their close by this UTC time in every season (4pm ET is 20:00-21:00 UTC). */
const STOCK_CLOSE_UTC_MINUTES = 21 * 60 + 30

/**
 * Days back to start looking for a finished bar. Once the US session is over,
 * today's stock bar is final, so use it: starting at yesterday made every
 * nightly run a trading day stale, which showed up as flat returns for a full
 * day. Crypto trades around the clock, so today's bar is never final.
 */
function firstDayBack(marketTickerIsCrypto: boolean, now: Date): number {
  if (marketTickerIsCrypto) return 1
  return now.getUTCHours() * 60 + now.getUTCMinutes() >= STOCK_CLOSE_UTC_MINUTES ? 0 : 1
}

/**
 * Latest daily close for each ticker, from whole-market daily bars.
 *
 * Starts at the latest finished day (see `firstDayBack`) and walks back past
 * weekends and holidays until a market has data. Tickers the market didn't
 * report are left out; callers keep the last price they had.
 */
export async function latestCloses(
  marketTickers: string[],
  { now = new Date(), fetchImpl = massiveFetch }: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<Map<string, Close>> {
  const out = new Map<string, Close>()
  const wanted = new Set(marketTickers)

  const markets = [
    { path: "/v2/aggs/grouped/locale/us/market/stocks", tickers: marketTickers.filter((t) => !isCrypto(t)), crypto: false },
    { path: "/v2/aggs/grouped/locale/global/market/crypto", tickers: marketTickers.filter(isCrypto), crypto: true },
  ]

  for (const market of markets) {
    if (market.tickers.length === 0) continue

    const first = firstDayBack(market.crypto, now)
    for (let back = first; back <= MAX_LOOKBACK_DAYS; back++) {
      const day = new Date(now)
      day.setUTCDate(day.getUTCDate() - back)
      const date = day.toISOString().slice(0, 10)

      let data: AggsResponse
      try {
        data = await get(`${market.path}/${date}?adjusted=true&include_otc=true`, fetchImpl)
      } catch (error) {
        // Some plans withhold the newest bars for a day or so. That is "not yet",
        // not an outage: the day before is still a correct answer. (Real trouble,
        // such as a bad key, fails every day, so it still surfaces further back.)
        const notYet = back <= 1 && error instanceof MarketDataError && (error.status === 403 || error.status === 404)
        if (notYet) continue
        throw error
      }
      if (!data.results?.length) continue

      for (const bar of data.results) {
        if (bar.T && wanted.has(bar.T) && typeof bar.c === "number") out.set(bar.T, { price: bar.c, asOf: date })
      }
      break
    }
  }

  return out
}

/** Only provider-confirmed instrument types; names are not classification evidence. */
export function securityTypeFromTickerType(type: string | undefined): "etf" | "equity" | null {
  if (type === "ETF") return "etf"
  if (type === "CS" || type === "ADRC" || type === "PFD") return "equity"
  return null
}

export type TickerDetails = { name: string | null; iconUrl: string | null; logoUrl: string | null; securityType: "etf" | "equity" | null }

/**
 * Company name and branding for a ticker, or null when the provider doesn't
 * know it. Crypto pairs have no branding; they return their name only.
 */
export async function tickerDetails(marketTicker: string, fetchImpl: typeof fetch = massiveFetch): Promise<TickerDetails | null> {
  type Response = { results?: { name?: string; type?: string; branding?: { icon_url?: string; logo_url?: string } } }
  let data: Response
  try {
    data = await getJson<Response>(`/v3/reference/tickers/${encodeURIComponent(marketTicker)}`, fetchImpl)
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 404) return null
    throw error
  }
  if (!data.results) return null
  return {
    name: data.results.name ?? null,
    securityType: securityTypeFromTickerType(data.results.type),
    iconUrl: data.results.branding?.icon_url ?? null,
    logoUrl: data.results.branding?.logo_url ?? null,
  }
}

export type TickerMatch = { symbol: string; name: string }

/** Up to `limit` active tickers matching what someone typed, for "did you mean". */
export async function searchTickers(
  query: string,
  kind: AssetKind,
  { limit = 3, fetchImpl = massiveFetch }: { limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<TickerMatch[]> {
  type Response = { results?: { ticker?: string; name?: string }[] }
  const market = kind === "crypto" ? "crypto" : "stocks"
  const data = await getJson<Response>(
    `/v3/reference/tickers?search=${encodeURIComponent(query.trim())}&market=${market}&active=true&limit=${limit}`,
    fetchImpl,
  )
  return (data.results ?? [])
    .filter((r): r is { ticker: string; name: string } => !!r.ticker && !!r.name)
    .map((r) => ({ symbol: displaySymbol(r.ticker), name: r.name }))
}
