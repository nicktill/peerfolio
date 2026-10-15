import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { providerTickers } from "@web/lib/provider-tickers"

export const GET = withUser<unknown>(async (userId) => {
  await assertAdmin(userId)
  return NextResponse.json(await providerTickers())
})
