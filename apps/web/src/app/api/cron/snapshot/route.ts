import { NextResponse } from "next/server"
import { listSyncableUserIds, syncUser } from "@web/lib/plaid-sync"
import { assertCronAuthorized, withPublic } from "@web/lib/api"

export const maxDuration = 300

/**
 * Nightly job: refresh every connected user and append one snapshot each.
 *
 * This is what makes performance history exist at all, so a partial failure
 * must not abort the run — one broken institution would otherwise cost every
 * later user their data point for the day, permanently.
 */
export const GET = withPublic<unknown>(async (request) => {
  assertCronAuthorized(request)

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
  return NextResponse.json({ users: userIds.length, succeeded, failures })
})
