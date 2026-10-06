import "server-only"
import { eq } from "drizzle-orm"
import { db, plaidRemovals } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, plaidErrorCode } from "@web/lib/plaid"

export async function queuePlaidRemoval(item: { id: string; accessToken: string }) {
  await db.insert(plaidRemovals).values({ id: item.id, accessToken: item.accessToken }).onConflictDoNothing()
}
export async function retryPlaidRemovals(limit = 3) {
  const rows = await db.select().from(plaidRemovals).orderBy(plaidRemovals.createdAt).limit(limit)
  let removed = 0
  for (const item of rows) {
    try {
      await getPlaidClient().itemRemove({ access_token: decrypt(item.accessToken) })
      await db.delete(plaidRemovals).where(eq(plaidRemovals.id, item.id))
      removed++
    } catch (error) {
      if (["INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND"].includes(plaidErrorCode(error) ?? "")) {
        await db.delete(plaidRemovals).where(eq(plaidRemovals.id, item.id))
        removed++
      } else console.warn("[plaid] removal pending", item.id)
    }
  }
  return { attempted: rows.length, removed, pending: rows.length - removed }
}
