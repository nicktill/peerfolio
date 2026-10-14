import "server-only"
import type { MutationStore } from "@web/lib/manual-mutation"
import { accountEvents, db } from "@web/db"
import { investableTotal } from "@web/lib/plaid-sync"
import { buildAccountEvent, type AccountEventInput } from "@web/lib/account-events-core"

export type { AccountEventInput }

/**
 * Records a change to a manual account. Call it right after the change, with
 * the investable total taken just before it (the same `before` that brackets the
 * snapshot's cash flow).
 *
 * History is for explaining numbers after the fact, so a failure to write it is
 * logged and swallowed: someone's edit must never fail because the audit row did.
 */
export async function recordAccountEvent(userId: string, investableBefore: number, input: AccountEventInput, store: MutationStore = db) {
  try {
    const after = await investableTotal(userId, store)
    await store.insert(accountEvents).values(buildAccountEvent(userId, investableBefore, after, input))
  } catch (error) {
    console.error("[account-events] could not record", input.action, error)
  }
}
