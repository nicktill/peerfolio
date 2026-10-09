import { NextResponse } from "next/server"
import { syncUser } from "@web/lib/plaid-sync"
import { ApiError, withUser } from "@web/lib/api"
import { db, plaidItems } from "@web/db"
import { eq } from "drizzle-orm"

export const maxDuration = 120

/** Manual "refresh now" from the dashboard. */
export const POST = withUser<unknown>(async (userId) => {
  const { results, totals, paused } = await syncUser(userId)
  if (paused && (await db.select({ id: plaidItems.id }).from(plaidItems).where(eq(plaidItems.userId, userId)).limit(1)).length > 0) {
    throw new ApiError("Brokerage connections are paused right now, so your linked accounts show their last synced numbers.", 503, { code: "PLAID_PAUSED" })
  }
  const failed = results.some((r) => r.status !== "active")
  return NextResponse.json({ results, totals, ...(failed ? { error: "Some accounts could not refresh. Check your connections and try again." } : {}) }, { status: failed ? 502 : 200 })
})
