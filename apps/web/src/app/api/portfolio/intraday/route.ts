import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { withUser } from "@web/lib/api"
import { loadPositions } from "@web/lib/ai/portfolio-data"
import { intradayDeltas } from "@web/lib/intraday"
import { latestStartedSession, newYorkInstant } from "@web/lib/market-hours"
import { fetchIntradayBars, marketFetch, type Fetch } from "@web/lib/news-market"
import { alpacaAuth } from "@web/lib/news-market-cache"
import { providerFetch, withProviderPatience } from "@web/lib/provider-fetch"

export const dynamic = "force-dynamic"

/** Bars for one set of tickers, shared by anyone holding exactly that set for two minutes. The key is the session and the sorted tickers. */
const barsFor = unstable_cache(
  async (key: string) => {
    const [session, joined] = key.split("|") as [string, string]
    const auth = alpacaAuth()
    if (!auth) return []
    const bars = await withProviderPatience(10_000, () =>
      fetchIntradayBars(joined.split(","), newYorkInstant(session, 9 * 60 + 30), auth, marketFetch((name) => providerFetch(name) as Fetch)),
    )
    if (bars.size === 0) throw new Error("no bars")
    return [...bars.entries()]
  },
  ["portfolio-intraday-bars-v1"],
  { revalidate: 120 },
)

/**
 * How much today has added to or taken from the signed-in user's holdings, at five-minute steps since the
 * session opened. Only what the user holds, only their own positions; the client adds it to the previous close.
 */
export const GET = withUser<unknown>(async (userId) => {
  const positions = (await loadPositions(userId))
    .filter((p) => p.value > 0 && p.ticker && p.previousClose != null && p.previousClose > 0 && p.quantity > 0 && /^[A-Z][A-Z0-9]{0,5}(\.[A-Z0-9]{1,2})?$/.test(p.ticker))
    .map((p) => ({ ticker: p.ticker!, quantity: p.quantity, previousClose: p.previousClose! }))
  const tickers = [...new Set(positions.map((p) => p.ticker))].sort()
  const session = latestStartedSession(new Date())
  if (tickers.length === 0) return NextResponse.json({ session, points: [] })

  const bars = new Map(await barsFor(`${session}|${tickers.join(",")}`).catch(() => []))
  return NextResponse.json({ session, points: intradayDeltas(positions, bars) }, { headers: { "Cache-Control": "private, no-store" } })
})
