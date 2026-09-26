import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, accounts, plaidItems } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient } from "@web/lib/plaid"
import { syncItem, writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError, withUser } from "@web/lib/api"

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
  await writeDailySnapshot(userId)

  return NextResponse.json({ result })
})

/**
 * Disconnects an institution.
 *
 * Calls Plaid's `/item/remove` first — skipping it would leave the Item live
 * and billable forever. Local rows go regardless, so a Plaid-side failure can
 * never strand a connection the user asked to delete.
 */
export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  const item = await requireOwnedItem(userId, id)

  try {
    await getPlaidClient().itemRemove({ access_token: decrypt(item.accessToken) })
  } catch (error) {
    console.error("[plaid] item/remove failed; removing locally anyway", error)
  }

  await db.delete(accounts).where(eq(accounts.itemId, item.id))
  await db.delete(plaidItems).where(eq(plaidItems.id, item.id))
  await writeDailySnapshot(userId)

  return NextResponse.json({ ok: true })
})
