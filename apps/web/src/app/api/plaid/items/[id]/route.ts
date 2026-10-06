import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, accounts, plaidItems, withPortfolioWrite } from "@web/db"
import { investableTotal, syncUser, writeDailySnapshot } from "@web/lib/plaid-sync"
import { queuePlaidRemoval } from "@web/lib/plaid-removal"
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

  // A re-sync is not a structural change, so any movement is performance.
  const refreshed = await syncUser(userId, id)
  const result = refreshed.results.find(r => r.itemId === id)

  return NextResponse.json({ result })
})

/**
 * Disconnects an institution.
 *
 * Queues Plaid's `/item/remove` durably — skipping it would leave the Item live
 * and billable forever. Local rows go regardless, so a Plaid-side failure can
 * never strand a connection the user asked to delete.
 */
export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  const item = await requireOwnedItem(userId, id)

  await withPortfolioWrite(userId, async () => {
    await queuePlaidRemoval(item)
    const before = await investableTotal(userId)
    await db.delete(accounts).where(eq(accounts.itemId, item.id))
    await db.delete(plaidItems).where(eq(plaidItems.id, item.id))
    await writeDailySnapshot(userId, (await investableTotal(userId)) - before)
  })

  return NextResponse.json({ ok: true })
})
