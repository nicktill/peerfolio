import "server-only"
import { desc, eq, lt } from "drizzle-orm"
import { db, plaidItems, plaidSyncRuns } from "@web/db"
import { SYNC_RUN_RETENTION_DAYS, type SyncRunRow } from "@web/lib/plaid-sync-runs-core"

/** Longest a log write may hold up a sync. */
const RECORD_TIMEOUT_MS = 2000

/** Saves one run. Best effort: a logging problem never fails or noticeably delays a sync. */
export async function recordSyncRun(row: SyncRunRow): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      db.insert(plaidSyncRuns).values(row),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, RECORD_TIMEOUT_MS) }),
    ])
  } catch (error) {
    console.warn("[plaid-sync] could not record sync run", error instanceof Error ? error.message : "unknown")
  } finally {
    clearTimeout(timer)
  }
}

/** Newest runs first, with the institution's name. No tokens or balances are stored or read here. */
export async function listRecentSyncRuns(limit = 100) {
  return db
    .select({ run: plaidSyncRuns, institution: plaidItems.institutionName })
    .from(plaidSyncRuns)
    .leftJoin(plaidItems, eq(plaidItems.id, plaidSyncRuns.itemId))
    .orderBy(desc(plaidSyncRuns.startedAt))
    .limit(limit)
}

export async function pruneSyncRuns(now = new Date()): Promise<void> {
  await db.delete(plaidSyncRuns).where(lt(plaidSyncRuns.startedAt, new Date(now.getTime() - SYNC_RUN_RETENTION_DAYS * 86_400_000)))
}
