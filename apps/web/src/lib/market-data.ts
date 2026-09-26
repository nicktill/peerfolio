/**
 * End-of-day prices from Massive (formerly Polygon.io).
 *
 * The nightly job asks for the whole market's daily bars in one request per
 * asset class rather than one request per ticker, so the call count stays flat
 * no matter how many people or positions there are.
 *
 * Free of database imports so the tests can exercise it with a stubbed fetch.
 */

const BASE_URL = "https://api.massive.com"

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
  const key = process.env.MASSIVE_API_KEY
  if (!key) throw new MarketDataError("MASSIVE_API_KEY is not set")

  const response = await fetchImpl(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  })

  if (!response.ok) throw new MarketDataError(`Market data request failed (${response.status})`, response.status)
  return (await response.json()) as AggsResponse
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Most recent completed daily close for one ticker, or null if it doesn't trade. */
export async function previousClose(marketTicker: string, fetchImpl: typeof fetch = fetch): Promise<Close | null> {
  const data = await get(`/v2/aggs/ticker/${encodeURIComponent(marketTicker)}/prev?adjusted=true`, fetchImpl)
  const bar = data.results?.[0]
  if (!bar || typeof bar.c !== "number" || typeof bar.t !== "number") return null
  return { price: bar.c, asOf: isoDate(bar.t) }
}

/**
 * Latest daily close for each ticker, from whole-market daily bars.
 *
 * Starts at yesterday (UTC) so every bar is a finished day, and walks back past
 * weekends and holidays until a market has data. Tickers the market didn't
 * report are left out; callers keep the last price they had.
 */
export async function latestCloses(
  marketTickers: string[],
  { now = new Date(), fetchImpl = fetch }: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<Map<string, Close>> {
  const out = new Map<string, Close>()
  const wanted = new Set(marketTickers)

  const markets = [
    { path: "/v2/aggs/grouped/locale/us/market/stocks", tickers: marketTickers.filter((t) => !isCrypto(t)) },
    { path: "/v2/aggs/grouped/locale/global/market/crypto", tickers: marketTickers.filter(isCrypto) },
  ]

  for (const market of markets) {
    if (market.tickers.length === 0) continue

    for (let back = 1; back <= MAX_LOOKBACK_DAYS; back++) {
      const day = new Date(now)
      day.setUTCDate(day.getUTCDate() - back)
      const date = day.toISOString().slice(0, 10)

      const data = await get(`${market.path}/${date}?adjusted=true&include_otc=true`, fetchImpl)
      if (!data.results?.length) continue

      for (const bar of data.results) {
        if (bar.T && wanted.has(bar.T) && typeof bar.c === "number") out.set(bar.T, { price: bar.c, asOf: date })
      }
      break
    }
  }

  return out
}
