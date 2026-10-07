import { NextResponse } from "next/server"
import { syncUser } from "@web/lib/plaid-sync"
import { withUser } from "@web/lib/api"

export const maxDuration = 120

/** Manual "refresh now" from the dashboard. */
export const POST = withUser<unknown>(async (userId) => {
  const { results, totals } = await syncUser(userId)
  const failed = results.some((r) => r.status !== "active")
  return NextResponse.json({ results, totals, ...(failed ? { error: "Some accounts could not refresh. Check your connections and try again." } : {}) }, { status: failed ? 502 : 200 })
})
