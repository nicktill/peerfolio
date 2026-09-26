import { NextResponse } from "next/server"
import { syncUser } from "@web/lib/plaid-sync"
import { withUser } from "@web/lib/api"

/** Manual "refresh now" from the dashboard. */
export const POST = withUser<unknown>(async (userId) => {
  const { results, totals } = await syncUser(userId)
  return NextResponse.json({ results, totals })
})
