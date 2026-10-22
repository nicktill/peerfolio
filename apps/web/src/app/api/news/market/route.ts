import { NextResponse } from "next/server"
import { withPublic } from "@web/lib/api"
import { earningsWeekDates, nyDate } from "@web/lib/news-market"
import { alpacaAuth, board, earnings, fearGreed } from "@web/lib/news-market-cache"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Each part is cached on its own clock and refreshed by whoever visits after
 * it goes stale, so nothing here waits on a scheduled job: a quiet day costs
 * nothing, and the first visitor after the window brings it up to date. A
 * failed fetch is cached as "nothing to show" for the same window, so an
 * outage hides the card instead of hammering the source.
 */
/**
 * Indexes and sectors, the earnings week and Fear & Greed. Public market data,
 * no user data. `?part=board|earnings|fear-greed` returns one of them, so the
 * page can show each as soon as it's ready.
 */
export const GET = withPublic<unknown>(async (request) => {
  const now = new Date()
  const part = new URL(request.url).searchParams.get("part")
  // The edge window matches each part's own clock: the board's quotes refresh every 5 minutes (clients poll it at 5),
  // earnings and Fear & Greed at most hourly. A shorter window only re-ran this function to return the same cached data.
  const slow = part === "earnings" || part === "fear-greed"
  const headers = { "Cache-Control": slow ? "public, s-maxage=1800, stale-while-revalidate=3600" : "public, s-maxage=300, stale-while-revalidate=600" }
  // Preview deployments may omit paid provider keys. Reuse the public, cached
  // production feed with no cookies or authorization headers; never proxy accounts.
  const missingBoard = !process.env.FINNHUB_API_KEY && !alpacaAuth()
  const missingEarnings = !process.env.FINNHUB_API_KEY
  if (process.env.VERCEL_ENV === "preview" && ((part === "board" && missingBoard) || (part === "earnings" && missingEarnings))) {
    try {
      const response = await fetch(`https://www.peerfolio.org/api/news/market?part=${part}`, { next: { revalidate: part === "board" ? 300 : 3600 }, signal: AbortSignal.timeout(55_000) })
      if (response.ok) return NextResponse.json(await response.json(), { headers })
    } catch (error) {
      console.error("[news] public market feed unavailable:", error instanceof Error ? error.message : error)
    }
  }

  if (part === "board") return NextResponse.json({ board: await board() }, { headers })
  if (part === "earnings") return NextResponse.json({ earnings: await earnings(earningsWeekDates(now)[0]!) }, { headers })
  if (part === "fear-greed") return NextResponse.json({ fearGreed: await fearGreed(nyDate(now)) }, { headers })
  const [b, e, f] = await Promise.all([board(), earnings(earningsWeekDates(now)[0]!), fearGreed(nyDate(now))])
  return NextResponse.json({ board: b, earnings: e, fearGreed: f }, { headers })
})
