import "server-only"
import { eq, sql } from "drizzle-orm"
import { db, accounts, plaidItems } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, plaidErrorCode } from "@web/lib/plaid"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError } from "@web/lib/api"

type Item = typeof plaidItems.$inferSelect

/**
 * Removes one Item at Plaid (`/item/remove`, which ends its billing) and then its
 * local rows. Plaid goes first: if it's unreachable the encrypted token is kept, so
 * the removal can be retried instead of stranding a live, billable connection.
 * Never blocked by the pause switch, since disconnecting is how costs stop.
 */
export async function disconnectItem(item: Item): Promise<void> {
  try {
    await getPlaidClient().itemRemove({ access_token: decrypt(item.accessToken) })
  } catch (error) {
    const code = plaidErrorCode(error)
    if (code !== "INVALID_ACCESS_TOKEN" && code !== "ITEM_NOT_FOUND") {
      throw new ApiError("Could not disconnect from Plaid. Your connection was preserved; please try again shortly.", 502)
    }
  }

  await db.transaction(async (store) => {
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${item.userId}))`)
    const before = await investableTotal(item.userId, store)
    await store.delete(accounts).where(eq(accounts.itemId, item.id))
    await store.delete(plaidItems).where(eq(plaidItems.id, item.id))
    await writeDailySnapshot(item.userId, (await investableTotal(item.userId, store)) - before, undefined, store)
  })
}
