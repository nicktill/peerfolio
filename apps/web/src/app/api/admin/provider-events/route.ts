import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { providerEvents } from "@web/lib/provider-stats"
import { isEventKind, isRange } from "@web/lib/provider-stats-core"

const PROVIDERS = new Set(["alpaca", "finnhub", "massive", "tiingo"])

export const GET = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const params = new URL(request.url).searchParams
  const range = params.get("range")
  const provider = params.get("provider")
  const kinds = (params.get("kind") ?? "").split(",").filter(isEventKind)
  const limit = Number(params.get("limit"))
  return NextResponse.json(
    await providerEvents({
      range: isRange(range) ? range : "24h",
      provider: provider && PROVIDERS.has(provider) ? provider : undefined,
      kinds,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
    }),
  )
})
