import { NextResponse } from "next/server"
import { listSyncableUserIds, syncUser } from "@web/lib/plaid-sync"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { repricePositions } from "@web/lib/positions"

export const maxDuration = 300

/**
 * Nightly job: reprice manual positions, refresh every connected user, and
 * append one snapshot each.
 *
 * This is what makes performance history exist at all, so a partial failure
 * must not abort the run — one broken institution would otherwise cost every
 * later user their data point for the day, permanently.
 */
export const GET = withPublic<unknown>(async (request) => {
  assertCronAuthorized(request)

  // Prices first, so tonight's snapshots carry the latest closes. If the market
  // data call fails, snapshots still go out at yesterday's prices: a flat day
  // is recoverable, a missing one isn't.
  let pricing: Awaited<ReturnType<typeof repricePositions>> | { error: string }
  try {
    pricing = await repricePositions()
  } catch (error) {
    console.error("[cron] repricing failed", error)
    pricing = { error: error instanceof Error ? error.message : "unknown" }
  }

  const userIds = await listSyncableUserIds()
  let succeeded = 0
  const failures: { userId: string; error: string }[] = []

  for (const userId of userIds) {
    try {
      await syncUser(userId)
      succeeded++
    } catch (error) {
      failures.push({ userId, error: error instanceof Error ? error.message : "unknown" })
    }
  }

  console.log(`[cron] snapshot complete: ${succeeded}/${userIds.length} users`)
  return NextResponse.json({ pricing, users: userIds.length, succeeded, failures })
})
