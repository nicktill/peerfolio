import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { cachedInfrastructureBudget } from "@web/lib/infrastructure-budget-reader"

export const GET = withUser<unknown>(async (userId) => {
  await assertAdmin(userId)
  return NextResponse.json(await cachedInfrastructureBudget(), { headers: { "Cache-Control": "private, no-store" } })
})
