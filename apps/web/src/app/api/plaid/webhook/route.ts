import { NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db, plaidItems } from "@web/db"
import { itemWebhookState } from "@web/lib/plaid-status"
import { syncItem } from "@web/lib/plaid-sync"
import { verifyPlaidWebhook } from "@web/lib/plaid-webhook"

export const maxDuration = 120

type WebhookBody = {
  webhook_type?: string
  webhook_code?: string
  item_id?: string
  error?: { error_code?: string } | null
}

/**
 * Plaid webhook receiver.
 *
 * Without this, an item that falls out of auth stays silently stale until the
 * user notices their numbers stopped moving.
 */
export async function POST(request: Request) {
  // Verification hashes the exact bytes Plaid signed, so read the body as text.
  const raw = await request.text()

  const verified = await verifyPlaidWebhook(raw, request.headers.get("plaid-verification"))
  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
  }

  let body: WebhookBody
  try {
    body = JSON.parse(raw) as WebhookBody
    if (!body || typeof body !== "object" || Array.isArray(body) || (body.item_id !== undefined && typeof body.item_id !== "string")) {
      return NextResponse.json({ error: "Invalid webhook body" }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { webhook_type: type, webhook_code: code, item_id: plaidItemId } = body
  if (!plaidItemId) return NextResponse.json({ ok: true })

  const item = await db.query.plaidItems.findFirst({ where: eq(plaidItems.plaidItemId, plaidItemId) })
  if (!item) return NextResponse.json({ ok: true })

  if (type === "ITEM") {
    await db.transaction(async (store) => {
      await store.execute(sql`set local lock_timeout = '10s'`)
      await store.execute(sql`select pg_advisory_xact_lock(hashtext(${item.userId}))`)
      const current = await store.query.plaidItems.findFirst({ where: eq(plaidItems.id, item.id) })
      if (!current) return
      const update = itemWebhookState(current.status, code, body.error?.error_code)
      if (update) await store.update(plaidItems).set(update).where(eq(plaidItems.id, item.id))
    })
    return NextResponse.json({ ok: true })
  }

  // Fresh data available — pull it and re-stamp today's snapshot.
  if (
    (type === "HOLDINGS" && code === "DEFAULT_UPDATE") ||
    (type === "INVESTMENTS_TRANSACTIONS" && (code === "DEFAULT_UPDATE" || code === "HISTORICAL_UPDATE"))
  ) {
    const result = await syncItem(item.id)
    if (result.status !== "active") return NextResponse.json({ error: "Sync not ready" }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
