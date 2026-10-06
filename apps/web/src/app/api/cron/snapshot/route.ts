import { NextResponse } from "next/server"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { runSnapshotJob } from "@web/lib/snapshot-job"
import { retryPlaidRemovals } from "@web/lib/plaid-removal"

export const maxDuration = 300

export const GET = withPublic<unknown>(async request => {
  assertCronAuthorized(request)
  const deadline = Date.now() + 250_000
  const result = await runSnapshotJob({ deadline })
  const removals = Date.now() < deadline ? await retryPlaidRemovals(1) : { deferred: true }
  return NextResponse.json({ ...result, removals }, { status: result.healthy ? 200 : 500 })
})
