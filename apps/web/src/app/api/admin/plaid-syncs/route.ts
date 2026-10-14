import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { db, plaidItems } from "@web/db"
import { ne } from "drizzle-orm"
import { listRecentSyncRuns } from "@web/lib/plaid-sync-runs"
import { runConcern } from "@web/lib/plaid-sync-runs-core"

export const GET = withUser<unknown>(async (userId) => {
  await assertAdmin(userId)
  const [rows, items] = await Promise.all([
    listRecentSyncRuns(100),
    db.select({ id: plaidItems.id, institution: plaidItems.institutionName, status: plaidItems.status, lastSyncedAt: plaidItems.lastSyncedAt }).from(plaidItems).where(ne(plaidItems.status, "disconnected")),
  ])
  // Run rows carry shortened ids. Only `items` has full ids, for the admin-only "Sync now" action.
  return NextResponse.json({
    items,
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
