import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { and, inArray, isNotNull } from "drizzle-orm"
import { db, securities } from "@web/db"
import { withPublic } from "@web/lib/api"
import { providerFetch, withProviderPatience } from "@web/lib/provider-fetch"
import { earningsWeekDates, fetchEarningsWeek, fetchFearGreed, fetchMarketBoard, nyDate } from "@web/lib/news-market"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Each part is cached on its own clock and refreshed by whoever visits after
 * it goes stale, so nothing here waits on a scheduled job: a quiet day costs
 * nothing, and the first visitor after the window brings it up to date. A
 * failed fetch is cached as "nothing to show" for the same window, so an
 * outage hides the card instead of hammering the source.
 */
const board = unstable_cache(
  async () =>
    // Fifteen quotes is more than Finnhub's burst, so this waits its turn for tokens rather than come back half empty.
    withProviderPatience(30_000, () => fetchMarketBoard({
      finnhubKey: process.env.FINNHUB_API_KEY,
      alpaca: process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET ? { keyId: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_API_SECRET } : null,
      fetchImpl: (url, init) => (url.includes("finnhub.io") ? providerFetch("finnhub") : providerFetch("alpaca"))(url, init),
    })).catch((error) => {
      console.error("[news] market board failed:", error instanceof Error ? error.message : error)
      return null
    }),
  ["news-market-board-v1"],
  { revalidate: 300 },
)

const earnings = unstable_cache(
  // The week's Monday is only the cache key, so a new week starts a new entry.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (_week: string) =>
    withProviderPatience(40_000, () => fetchEarningsWeek({
      finnhubKey: process.env.FINNHUB_API_KEY,
      fetchImpl: providerFetch("finnhub"),
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
  ["news-earnings-v1"],
  { revalidate: 6 * 3600 },
)

// The New York date is only the cache key, so each day starts a new entry.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fearGreed = unstable_cache(async (_day: string) => fetchFearGreed(fetch), ["news-fear-greed-v1"], { revalidate: 3600 })

/** Indexes, sectors, the earnings week and Fear & Greed. Public market data, no user data. */
export const GET = withPublic<unknown>(async () => {
  const now = new Date()
  const [b, e, f] = await Promise.all([board(), earnings(earningsWeekDates(now)[0]!), fearGreed(nyDate(now))])
  return NextResponse.json({ board: b, earnings: e, fearGreed: f }, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } })
})
