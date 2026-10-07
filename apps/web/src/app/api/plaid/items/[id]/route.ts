import { NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db, accounts, plaidItems } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, plaidErrorCode } from "@web/lib/plaid"
import { investableTotal, syncItem, writeDailySnapshot } from "@web/lib/plaid-sync"
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

  try {
    await getPlaidClient().itemRemove({ access_token: decrypt(item.accessToken) })
  } catch (error) {
    if (plaidErrorCode(error) !== "INVALID_ACCESS_TOKEN" && plaidErrorCode(error) !== "ITEM_NOT_FOUND") {
      throw new ApiError("Could not disconnect from Plaid. Your connection was preserved; please try again shortly.", 502)
    }
  }

  await db.transaction(async (store) => {
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    const before = await investableTotal(userId, store)
    await store.delete(accounts).where(eq(accounts.itemId, item.id))
    await store.delete(plaidItems).where(eq(plaidItems.id, item.id))
    await writeDailySnapshot(userId, (await investableTotal(userId, store)) - before, undefined, store)
  })

  return NextResponse.json({ ok: true })
})
