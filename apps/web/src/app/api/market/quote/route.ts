import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db, securities } from "@web/db"
import { ApiError, withUser } from "@web/lib/api"
import { isFundTicker } from "@web/lib/fund-ticker"
import { isProviderChecked } from "@web/lib/fund-ticker"
import { ensureLivePrice } from "@web/lib/live-quotes"
import { displaySymbol, toMarketTicker } from "@web/lib/market-data"
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

  const marketTicker = toMarketTicker(symbol, kind)

  // A mutual fund publishes one price a day and only Tiingo has it: answer from the stored
  // price, and never ask Finnhub or Massive (both can only refuse).
  const fundRow = async () => {
    const stored = kind === "stock" && marketTicker ? await db.query.securities.findFirst({ where: eq(securities.id, `mkt:${marketTicker}`) }) : undefined
    return stored && isFundTicker({ marketTicker: stored.marketTicker, type: stored.type, providerChecked: isProviderChecked(stored) }) ? stored : null
  }
  const storedFund = await fundRow()
  if (storedFund?.closePrice && storedFund.closePriceAsOf) {
    return NextResponse.json({ symbol: displaySymbol(marketTicker!), kind, name: storedFund.name, price: Number(storedFund.closePrice), asOf: storedFund.closePriceAsOf, live: false })
  }

  const quote = await lookupTicker(symbol, kind)
  // Reuses a price fetched in the last minute, so previews don't spend the provider's limit.
  // (A fund first priced by this very lookup has no live price either.)
  const live = kind === "stock" && marketTicker && !(await fundRow()) ? await ensureLivePrice(marketTicker, { maxAgeSeconds: 60 }) : null
  return NextResponse.json(live ? { ...quote, price: live.price, asOf: live.asOf, live: true } : { ...quote, live: false })
})
