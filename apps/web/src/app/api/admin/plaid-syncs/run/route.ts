import { NextResponse } from "next/server"
import { and, desc, eq, gte } from "drizzle-orm"
import { z } from "zod"
import { db, plaidItems, plaidSyncRuns } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { assertPlaidActive } from "@web/lib/plaid-switch"
import { syncItem } from "@web/lib/plaid-sync"
import { isItemRowId, manualRunGate, summarizeRun } from "@web/lib/plaid-sync-runs-core"

export const maxDuration = 120

const Body = z.object({ itemId: z.string() }).strict()
// Backs up the database cooldown for the window before a run is recorded.
const inFlight = new Set<string>()

/**
 * Admin-only: re-runs one connection's normal sync (stored Plaid data; never the billable
 * investments refresh). Reuses syncItem, so the kill switch, Trial-only credentials and the
 * per-user lock all apply.
 */
export const POST = withUser<unknown>(async (userId, request) => {
  const admin = await assertAdmin(userId)
  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success || !isItemRowId(parsed.data.itemId)) throw new ApiError("Expected a full connection id", 400)
  const itemId = parsed.data.itemId.toLowerCase()
  await assertPlaidActive()

  const item = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, itemId), columns: { id: true, status: true } })
  if (!item) throw new ApiError("Connection not found", 404)
  if (item.status === "disconnected") throw new ApiError("This connection is disconnected", 409)

  const [last] = await db.select({ startedAt: plaidSyncRuns.startedAt, durationMs: plaidSyncRuns.durationMs }).from(plaidSyncRuns)
    .where(eq(plaidSyncRuns.itemId, itemId)).orderBy(desc(plaidSyncRuns.startedAt)).limit(1)
  const gate = manualRunGate({ lastFinishedAt: last ? new Date(last.startedAt.getTime() + last.durationMs) : null, now: new Date(), inFlight: inFlight.has(itemId) })
  if (!gate.ok) {
    throw new ApiError(gate.reason === "in_flight" ? "A sync for this connection is already running" : `This connection synced a moment ago. Try again in ${gate.retryAfterSec}s.`, 429, { code: "SYNC_RATE_LIMITED", retryAfterSec: gate.retryAfterSec })
  }

  inFlight.add(itemId)
  const startedAt = new Date()
  try {
    console.info(`[plaid-sync] admin run ${JSON.stringify({ admin: admin.id, item: itemId })}`)
    const result = await syncItem(itemId, undefined, "manual")
    const [run] = await db.select().from(plaidSyncRuns)
      .where(and(eq(plaidSyncRuns.itemId, itemId), eq(plaidSyncRuns.trigger, "manual"), gte(plaidSyncRuns.startedAt, startedAt)))
      .orderBy(desc(plaidSyncRuns.startedAt)).limit(1)
    // Counts only: no balances, tokens or ids from other tables.
    return NextResponse.json({
      result: { status: result.status, errorCode: result.errorCode ?? null, accounts: result.accounts, holdings: result.holdings, holdingsPending: result.holdingsPending ?? 0 },
      run: run ? { id: run.id, ...summarizeRun(run) } : null,
    })
  } finally {
    inFlight.delete(itemId)
  }
})
