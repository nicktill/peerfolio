import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { db, plaidItems } from "@web/db"
import { ne } from "drizzle-orm"
import { listRecentSyncRuns } from "@web/lib/plaid-sync-runs"
import { runConcern } from "@web/lib/plaid-sync-runs-core"

/** Stable anonymous tag for a user: tells connections of the same person apart without revealing who they are. */
const ownerTag = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 6)

export const GET = withUser<unknown>(async (userId) => {
  await assertAdmin(userId)
  const [rows, itemRows] = await Promise.all([
    listRecentSyncRuns(100),
    db.select({ id: plaidItems.id, userId: plaidItems.userId, institution: plaidItems.institutionName, status: plaidItems.status, errorCode: plaidItems.errorCode, lastSyncedAt: plaidItems.lastSyncedAt, createdAt: plaidItems.createdAt }).from(plaidItems).where(ne(plaidItems.status, "disconnected")),
  ])
  const owners = new Map(itemRows.map((it) => [it.id, ownerTag(it.userId)]))
  // Run rows carry shortened ids. Only `items` has full ids, for the admin-only "Sync now" action. Owners are anonymous tags, never emails or names.
  const items = itemRows.map(({ userId: owner, ...it }) => ({ ...it, owner: ownerTag(owner) }))
  return NextResponse.json({
    items,
    runs: rows.map(({ run, institution }) => ({
      id: run.id,
      item: run.itemId.slice(0, 8),
      owner: owners.get(run.itemId) ?? null,
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
      positionlessAccounts: run.positionlessAccounts,
      concern: runConcern({ ...run, holdingsSkipped: run.holdingsSkipped as Record<string, number> }),
    })),
  })
})
