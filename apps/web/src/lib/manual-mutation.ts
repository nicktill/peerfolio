import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@web/db"

export type MutationStore = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Manual changes share the same user lock as replacement, Plaid sync and disconnect. */
export function manualMutation<T>(userId: string, change: (store: MutationStore) => Promise<T>) {
  return db.transaction(async (store) => {
    await store.execute(sql`set local lock_timeout = '10s'`)
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    return change(store)
  })
}
