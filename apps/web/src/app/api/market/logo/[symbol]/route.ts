import { massiveFetch, toMarketTicker, tickerDetails } from "@web/lib/market-data"

type Ctx = { params: Promise<{ symbol: string }> }

const MONTH = 60 * 60 * 24 * 30

/**
 * A company's icon, proxied so the market data key never reaches the browser.
 * Cached at the edge for a month, so each ticker costs one provider call.
 * A miss is a cached 404 and the client falls back to a monogram.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { symbol } = await params
  const marketTicker = toMarketTicker(symbol, "stock")
  const key = process.env.MASSIVE_API_KEY
  const miss = () => new Response(null, { status: 404, headers: { "Cache-Control": `public, s-maxage=${60 * 60 * 24}` } })
  if (!marketTicker || !key) return miss()

  try {
    const details = await tickerDetails(marketTicker)
    const source = details?.iconUrl ?? details?.logoUrl
    if (!source) return miss()

    // The image is served by Massive with our key, so it spends from the same budget.
    const image = await massiveFetch(source, { headers: { Authorization: `Bearer ${key}` } })
    if (!image.ok) return miss()

    return new Response(image.body, {
      headers: {
        "Content-Type": image.headers.get("content-type") ?? "image/png",
        "Cache-Control": `public, max-age=${MONTH}, s-maxage=${MONTH}, immutable`,
      },
    })
  } catch {
    return miss()
  }
}
