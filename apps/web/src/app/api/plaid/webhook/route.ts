import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db, plaidItems } from "@web/db"
import { isReauthRequired } from "@web/lib/plaid"
import { syncUser } from "@web/lib/plaid-sync"
import { verifyPlaidWebhook } from "@web/lib/plaid-webhook"

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
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { webhook_type: type, webhook_code: code, item_id: plaidItemId } = body
  if (!plaidItemId) return NextResponse.json({ ok: true })

  const item = await db.query.plaidItems.findFirst({ where: eq(plaidItems.plaidItemId, plaidItemId) })
  if (!item) return NextResponse.json({ ok: true })

  if (type === "ITEM") {
    if (code === "ERROR") {
      const errorCode = body.error?.error_code ?? null
      await db
        .update(plaidItems)
        .set({ status: isReauthRequired(errorCode) ? "needs_reauth" : "error", errorCode })
        .where(eq(plaidItems.id, item.id))
    } else if (code === "PENDING_EXPIRATION" || code === "PENDING_DISCONNECT") {
      await db.update(plaidItems).set({ status: "needs_reauth", errorCode: code }).where(eq(plaidItems.id, item.id))
    } else if (code === "USER_PERMISSION_REVOKED" || code === "USER_ACCOUNT_REVOKED") {
      await db.update(plaidItems).set({ status: "disconnected", errorCode: code }).where(eq(plaidItems.id, item.id))
    }
    return NextResponse.json({ ok: true })
  }

  // Fresh data available — pull it and re-stamp today's snapshot.
  if (
    (type === "HOLDINGS" && code === "DEFAULT_UPDATE") ||
    (type === "INVESTMENTS_TRANSACTIONS" && code === "DEFAULT_UPDATE")
  ) {
    const refreshed = await syncUser(item.userId, item.id)
    if (!refreshed.healthy) return NextResponse.json({ error: "Partial sync failure" }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
