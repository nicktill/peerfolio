import { manualMutation } from "@web/lib/manual-mutation"
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { holdings, securities } from "@web/db"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"
import { withUser } from "@web/lib/api"
import { removePosition, requireManualAccount } from "@web/lib/positions"
import { recordAccountEvent } from "@web/lib/account-events"

type Ctx = { params: Promise<{ id: string; holdingId: string }> }

export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  return manualMutation(userId, async (store) => {
    const { id, holdingId } = await params
    const account = await requireManualAccount(userId, id, store)

    // Read what is being removed first: once it's gone there is nothing to describe.
    const [held] = await store
      .select({ symbol: securities.tickerSymbol, quantity: holdings.quantity, value: holdings.institutionValue })
      .from(holdings)
      .innerJoin(securities, eq(holdings.securityId, securities.id))
      .where(and(eq(holdings.id, holdingId), eq(holdings.accountId, id)))

    // Selling out is a withdrawal, not a loss.
    const before = await investableTotal(userId, store)
    await removePosition(id, holdingId, store)
    await writeDailySnapshot(userId, (await investableTotal(userId, store)) - before, undefined, store)
    await recordAccountEvent(userId, before, {
      action: "position_removed",
      accountId: id,
      accountName: account.name,
      detail: { symbol: held?.symbol, quantity: held ? Number(held.quantity) : undefined, value: held ? Number(held.value ?? 0) : undefined },
    }, store)

    return NextResponse.json({ ok: true })
  })
})
