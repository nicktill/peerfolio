import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { providerDashboard } from "@web/lib/provider-stats"
import { isRange } from "@web/lib/provider-stats-core"

export const GET = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const requested = new URL(request.url).searchParams.get("range")
  return NextResponse.json(await providerDashboard(isRange(requested) ? requested : "24h"))
})
