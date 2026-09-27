import { NextResponse } from "next/server"
import { ApiError, withUser } from "@web/lib/api"
import { lookupTicker } from "@web/lib/positions"

/** Price and name for a ticker, or a 404 with suggestions. Powers the add form's preview. */
export const GET = withUser<unknown>(async (_userId, request) => {
  const url = new URL(request.url)
  const symbol = url.searchParams.get("symbol")?.trim() ?? ""
  const kind = url.searchParams.get("kind") === "crypto" ? "crypto" : "stock"
  if (!symbol || symbol.length > 12) throw new ApiError("Enter a ticker")
  return NextResponse.json(await lookupTicker(symbol, kind))
})
