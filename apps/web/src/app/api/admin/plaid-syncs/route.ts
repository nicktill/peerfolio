import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { listRecentSyncRuns } from "@web/lib/plaid-sync-runs"
import { runConcern } from "@web/lib/plaid-sync-runs-core"

export const GET = withUser<unknown>(async (userId) => {
  await assertAdmin(userId)
  const rows = await listRecentSyncRuns(100)
  // Item and user ids are shortened: enough to tell runs apart, nothing to act on elsewhere.
  return NextResponse.json({
    runs: rows.map(({ run, institution }) => ({
      id: run.id,
      item: run.itemId.slice(0, 8),
      institution,
      trigger: run.trigger,
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      status: run.status,
      errorCode: run.errorCode,
      requestId: run.requestId,
      accounts: run.accountsReceived,
      received: run.holdingsReceived,
      kept: run.holdingsKept,
      skipped: run.holdingsSkipped as Record<string, number>,
      currencyAssumed: run.currencyAssumed,
      missingTicker: run.securitiesMissingTicker,
      balanceWithoutHoldings: run.balanceWithoutHoldings,
      concern: runConcern({ ...run, holdingsSkipped: run.holdingsSkipped as Record<string, number> }),
    })),
  })
})
