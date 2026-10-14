import "server-only"
import { and, eq, inArray, sql } from "drizzle-orm"
import { accountEvents, accounts, db, plaidItems } from "@web/db"
import { ApiError } from "@web/lib/api"
import { buildAccountEvent } from "@web/lib/account-events-core"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"

/** Explicit reconciliation only. Retain manual records; never guess by account name. */
export async function replaceManualAccount(userId: string, manualId: string, linkedId: string) {
  if (manualId === linkedId) throw new ApiError("Choose two different accounts", 409)
  return db.transaction(async (store) => {
    await store.execute(sql`set local lock_timeout = '10s'`)
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    const rows = await store.select().from(accounts).where(and(eq(accounts.userId, userId), inArray(accounts.id, [manualId, linkedId]))).for("update")
    const manual = rows.find((a) => a.id === manualId)
    const linked = rows.find((a) => a.id === linkedId)
    if (!manual || !linked) throw new ApiError("Account not found", 404)
    if (manual.source !== "manual" || !manual.isActive) throw new ApiError("Choose an active manual account", 409)
    if (linked.source !== "plaid" || !linked.isActive || !linked.itemId) throw new ApiError("Choose an active linked account", 409)
    if (manual.category !== "investment" || linked.category !== "investment") throw new ApiError("Only investment accounts can be replaced", 409)
    if ((manual.isoCurrencyCode ?? "USD") !== (linked.isoCurrencyCode ?? "USD")) throw new ApiError("The accounts must use the same currency", 409)
    if (linked.currentBalance === null || !Number.isFinite(Number(linked.currentBalance))) throw new ApiError("Wait for the linked balance to finish importing", 409)
    const item = await store.query.plaidItems.findFirst({ where: and(eq(plaidItems.id, linked.itemId), eq(plaidItems.userId, userId)) })
    if (!item || item.status !== "active" || !item.lastSyncedAt) throw new ApiError("Refresh the linked account before replacing a manual entry", 409)
    const previous = await store.query.accountEvents.findFirst({ where: and(eq(accountEvents.userId, userId), eq(accountEvents.action, "account_replaced"), sql`${accountEvents.detail}->>'linkedAccountId' = ${linkedId}`) })
    if (previous) throw new ApiError("This linked account already replaced a manual entry", 409)

    const before = await investableTotal(userId, store)
    await store.update(accounts).set({ isActive: false, updatedAt: new Date() }).where(eq(accounts.id, manualId))
    const after = await investableTotal(userId, store)
    // Removing duplicate capital is a structural correction, never a market loss.
    await writeDailySnapshot(userId, after - before, undefined, store)
    await store.insert(accountEvents).values(buildAccountEvent(userId, before, after, {
      action: "account_replaced", accountId: manualId, accountName: manual.name,
      detail: { linkedAccountId: linkedId, linkedAccountName: linked.name, manualBalance: manual.currentBalance, linkedBalance: linked.currentBalance, archived: true },
    }))
    return { ok: true, archivedAccountId: manualId, linkedAccountId: linkedId }
  })
}
