import { NextResponse } from "next/server"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"
import { withUser } from "@web/lib/api"
import { removePosition, requireManualAccount } from "@web/lib/positions"

type Ctx = { params: Promise<{ id: string; holdingId: string }> }

export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id, holdingId } = await params
  await requireManualAccount(userId, id)

  // Selling out is a withdrawal, not a loss.
  const before = await investableTotal(userId)
  await removePosition(id, holdingId)
  await writeDailySnapshot(userId, (await investableTotal(userId)) - before)

  return NextResponse.json({ ok: true })
})
