import { NextResponse } from "next/server"
import { ApiError, withUser } from "@web/lib/api"
import { ensureLivePrice } from "@web/lib/live-quotes"
import { toMarketTicker } from "@web/lib/market-data"
import { lookupTicker } from "@web/lib/positions"

/**
 * Price and name for a ticker, or a 404 with suggestions. Powers the add form's
 * and the trade panel's preview. While the market is open the price is the
 * current one (`live: true`); otherwise it's the latest close.
 */
export const GET = withUser<unknown>(async (_userId, request) => {
  const url = new URL(request.url)
  const symbol = url.searchParams.get("symbol")?.trim() ?? ""
  const kind = url.searchParams.get("kind") === "crypto" ? "crypto" : "stock"
  if (!symbol || symbol.length > 12) throw new ApiError("Enter a ticker")

  const quote = await lookupTicker(symbol, kind)
  const marketTicker = toMarketTicker(symbol, kind)
  // Reuses a price fetched in the last minute, so previews don't spend the provider's limit.
  const live = kind === "stock" && marketTicker ? await ensureLivePrice(marketTicker, { maxAgeSeconds: 60 }) : null
  return NextResponse.json(live ? { ...quote, price: live.price, asOf: live.asOf, live: true } : { ...quote, live: false })
})
