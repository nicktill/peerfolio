import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, plaidItems } from "@web/db"
import { disconnectItem } from "@web/lib/plaid-disconnect"
import { syncItem } from "@web/lib/plaid-sync"
import { ApiError, withUser } from "@web/lib/api"

export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

async function requireOwnedItem(userId: string, id: string) {
  const item = await db.query.plaidItems.findFirst({
    where: and(eq(plaidItems.id, id), eq(plaidItems.userId, userId)),
  })
  if (!item) throw new ApiError("Connection not found", 404)
  return item
}

/** Re-pulls balances and holdings for one institution. */
export const POST = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  await requireOwnedItem(userId, id)

  const result = await syncItem(id)

  // Link repair succeeded even when data is still warming up; expose sync status.
  return NextResponse.json({ result })
})

/**
 * Disconnects an institution.
 *
 * Calls Plaid's `/item/remove` first — skipping it would leave the Item live
 * and billable forever. If Plaid is unavailable, preserve the encrypted token so removal can be retried.
 * Losing that token would strand a live, billable remote connection.
 */
export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  const item = await requireOwnedItem(userId, id)

  await disconnectItem(item)

  return NextResponse.json({ ok: true })
})
