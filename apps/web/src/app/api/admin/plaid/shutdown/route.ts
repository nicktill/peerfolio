import { NextResponse } from "next/server"
import { z } from "zod"
import { db, plaidItems } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { disconnectItem } from "@web/lib/plaid-disconnect"
import { setPlaidPaused } from "@web/lib/plaid-switch"
import { shutdownConfirmed } from "@web/lib/plaid-switch-core"

export const maxDuration = 300

const Body = z.object({ confirm: z.string() }).strict()

/**
 * The emergency shutdown. Owner-only, and only with the typed phrase.
 *
 * Pauses Plaid first (so nothing new can start), then removes every Item at Plaid with
 * `/item/remove`, which ends its billing, and deletes the linked accounts here. Manual
 * accounts are untouched. If some removals fail, those connections are kept (so the
 * removal can be retried) and listed; run it again to finish.
 */
export const POST = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success || !shutdownConfirmed(parsed.data.confirm)) throw new ApiError("Type the confirmation phrase exactly to continue.", 400)

  await setPlaidPaused(true, userId)

  const items = await db.select().from(plaidItems)
  let removed = 0
  const failed: string[] = []
  for (const item of items) {
    try {
      await disconnectItem(item)
      removed += 1
    } catch (error) {
      console.error("[plaid-shutdown] could not remove item", { itemId: item.id, message: error instanceof Error ? error.message : "unknown" })
      failed.push(item.id)
    }
  }
  console.warn(`[plaid-shutdown] by ${userId}: removed ${removed} of ${items.length}`)
  return NextResponse.json({ removed, failed: failed.length, total: items.length })
})
