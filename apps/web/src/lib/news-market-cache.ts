import { unstable_cache } from "next/cache"
import { providerFetch, withProviderPatience } from "@web/lib/provider-fetch"
import { and, inArray, isNotNull } from "drizzle-orm"
import { db, securities } from "@web/db"
import { LARGE_CAPS } from "@web/lib/market-universe"
import { fetchEarningsWeek, fetchQuotes, fetchFearGreed, fetchMarketBoard, fetchMovers, marketFetch, type Fetch } from "@web/lib/news-market"

/**
 * The market board and Fear & Greed, cached across requests. Shared by the News
 * page's endpoint and the assistant's market tool, so both read one copy.
 */
export const alpacaAuth = () =>
  process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET ? { keyId: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_API_SECRET } : null

export const board = unstable_cache(
  async () =>
    // Fifteen quotes is more than Finnhub's burst, so this waits its turn for tokens rather than come back half empty.
    withProviderPatience(50_000, () => fetchMarketBoard({
      finnhubKey: process.env.FINNHUB_API_KEY,
      alpaca: alpacaAuth(),
      fetchImpl: marketFetch((name) => providerFetch(name) as Fetch),
    })).catch((error) => {
      console.error("[news] market board failed:", error instanceof Error ? error.message : error)
      return null
    }),
  ["news-market-board-v3"],
  { revalidate: 300 },
)

// The New York date is only the cache key, so each day starts a new entry.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const fearGreed = unstable_cache(async (_day: string) => fetchFearGreed(fetch), ["news-fear-greed-v1"], { revalidate: 3600 })


export const earnings = unstable_cache(
  // The week's Monday is only the cache key, so a new week starts a new entry.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (_week: string) =>
    withProviderPatience(50_000, () => fetchEarningsWeek({
      finnhubKey: process.env.FINNHUB_API_KEY,
      fetchImpl: marketFetch((name) => providerFetch(name) as Fetch),
      knownNames: async (symbols) => {
        if (symbols.length === 0) return new Map()
        const rows = await db
          .select({ symbol: securities.tickerSymbol, name: securities.name })
          .from(securities)
          .where(and(inArray(securities.tickerSymbol, symbols), isNotNull(securities.name)))
        return new Map(rows.flatMap((r) => (r.symbol && r.name ? [[r.symbol, r.name] as const] : [])))
      },
    })).catch((error) => {
      console.error("[news] earnings failed:", error instanceof Error ? error.message : error)
      return null
    }),
  ["news-earnings-v2"],
  { revalidate: 6 * 3600 },
)


/** Today's moves across the large-cap list, shared by everyone for five minutes (about two Alpaca requests). */
export const movers = unstable_cache(
  // The New York date is only the cache key, so each day starts a new entry.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (_day: string) =>
    // A failure throws, so a blip isn't remembered as "no movers" for the whole cache window.
    withProviderPatience(8_000, () => fetchMovers({ symbols: LARGE_CAPS, alpaca: alpacaAuth(), fetchImpl: marketFetch((name) => providerFetch(name) as Fetch) })).then((r) => {
      if (!r) throw new Error("no movers")
      return r
    }),
  ["assistant-movers-v1"],
  { revalidate: 300 },
)

/**
 * Quotes for a few tickers, shared across everyone and every server instance for a minute, so a popular
 * ticker costs one provider call a minute however many people ask. The key is the sorted symbol list.
 */
export const quotesFor = unstable_cache(
  async (key: string) => {
    const symbols = key.split(",")
    const quotes = await withProviderPatience(8_000, () =>
      fetchQuotes({ symbols, finnhubKey: process.env.FINNHUB_API_KEY, alpaca: alpacaAuth(), fetchImpl: marketFetch((name) => providerFetch(name) as Fetch) }),
    )
    if (quotes.size === 0) throw new Error("no quotes")
    return [...quotes.entries()]
  },
  ["assistant-quotes-v1"],
  { revalidate: 60 },
)
