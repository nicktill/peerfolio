import { NextResponse } from "next/server"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { db, plaidItems, plaidSyncRuns } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, plaidErrorCode, plaidErrorMessage } from "@web/lib/plaid"
import { assertAdmin } from "@web/lib/plaid-access"
import { decodePlaidToken } from "@web/lib/plaid-profile"
import { assertPlaidActive } from "@web/lib/plaid-switch"
import { recordSyncRun } from "@web/lib/plaid-sync-runs"
import { REFRESH_COOLDOWN_MS, buildSyncRun, emptyMetrics, isItemRowId, manualRunGate, plaidRequestId } from "@web/lib/plaid-sync-runs-core"

const Body = z.object({ itemId: z.string() }).strict()
const inFlight = new Set<string>()

/**
 * Admin-only: asks Plaid to re-extract investments from the institution (/investments/refresh).
 * Asynchronous. Plaid later sends a HOLDINGS DEFAULT_UPDATE webhook, which our webhook turns into a sync.
 * Uses the item's stored Trial profile; the paid profile is rejected inside decode/getPlaidClient.
 */
export const POST = withUser<unknown>(async (userId, request) => {
  const admin = await assertAdmin(userId)
  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success || !isItemRowId(parsed.data.itemId)) throw new ApiError("Expected a full connection id", 400)
  const itemId = parsed.data.itemId.toLowerCase()
  await assertPlaidActive()

  const item = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, itemId) })
  if (!item) throw new ApiError("Connection not found", 404)
  if (item.status === "disconnected") throw new ApiError("This connection is disconnected", 409)

  const [last] = await db.select({ startedAt: plaidSyncRuns.startedAt, durationMs: plaidSyncRuns.durationMs }).from(plaidSyncRuns)
    .where(and(eq(plaidSyncRuns.itemId, itemId), eq(plaidSyncRuns.trigger, "admin-refresh"))).orderBy(desc(plaidSyncRuns.startedAt)).limit(1)
  const gate = manualRunGate({ lastFinishedAt: last ? new Date(last.startedAt.getTime() + last.durationMs) : null, now: new Date(), inFlight: inFlight.has(itemId), cooldownMs: REFRESH_COOLDOWN_MS })
  if (!gate.ok) {
    const minutes = Math.ceil(gate.retryAfterSec / 60)
    throw new ApiError(gate.reason === "in_flight" ? "A refresh request for this connection is already running" : `A refresh was requested recently. Try again in ${minutes} min.`, 429, { code: "REFRESH_RATE_LIMITED", retryAfterSec: gate.retryAfterSec })
  }

  inFlight.add(itemId)
  const startedAt = new Date()
  const metrics = emptyMetrics()
  try {
    console.info(`[plaid-sync] admin refresh ${JSON.stringify({ admin: admin.id, item: itemId })}`)
    const stored = decodePlaidToken(decrypt(item.accessToken))
    const client = getPlaidClient(stored.profile)
    try {
      const response = await client.investmentsRefresh({ access_token: stored.token })
      metrics.requestId = plaidRequestId(response)
    } catch (error) {
      const code = plaidErrorCode(error) ?? "REFRESH_FAILED"
      metrics.requestId = plaidRequestId(error)
      await recordSyncRun(buildSyncRun({ itemId, userId: item.userId, trigger: "admin-refresh", startedAt, finishedAt: new Date(), failed: true, errorCode: code, metrics }))
      throw new ApiError(plaidErrorMessage(error), 502, { code, requestId: metrics.requestId })
    }
    await recordSyncRun(buildSyncRun({ itemId, userId: item.userId, trigger: "admin-refresh", startedAt, finishedAt: new Date(), failed: false, metrics }))
    return NextResponse.json({ requested: true, requestId: metrics.requestId })
  } finally {
    inFlight.delete(itemId)
  }
})
