import { toMarketTicker } from "@web/lib/market-data"
import { lookupTickerLogo } from "@web/lib/ticker-logo"

type Ctx = { params: Promise<{ symbol: string }> }

const MONTH = 60 * 60 * 24 * 30
const DAY = 60 * 60 * 24

/**
 * A company's icon, proxied so the market data key never reaches the browser.
 * Cached at the edge for a month, so each ticker is looked up once.
 * A miss is a 404 and the client falls back to a monogram. Only a real miss is
 * cached: a lookup refused by the request budget is asked again next time,
 * rather than leaving the ticker without its logo for a day.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { symbol } = await params
  const marketTicker = toMarketTicker(symbol, "stock")
  const key = process.env.MASSIVE_API_KEY
  const miss = (cacheControl: string) => new Response(null, { status: 404, headers: { "Cache-Control": cacheControl } })
  if (!marketTicker || !key) return miss(`public, s-maxage=${DAY}`)

  const logo = await lookupTickerLogo(marketTicker, key)
  if (logo.kind === "none") return miss(`public, s-maxage=${DAY}`)
  if (logo.kind === "unavailable") return miss("no-store")

  return new Response(logo.image.body, {
    headers: {
      "Content-Type": logo.image.headers.get("content-type") ?? "image/png",
      "Cache-Control": `public, max-age=${MONTH}, s-maxage=${MONTH}, immutable`,
    },
  })
}
