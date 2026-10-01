import { NextResponse } from "next/server"
import { z } from "zod"
import { investableTotal, writeDailySnapshot } from "@web/lib/plaid-sync"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { requireManualAccount, setPosition } from "@web/lib/positions"
import { recordAccountEvent } from "@web/lib/account-events"

type Ctx = { params: Promise<{ id: string }> }

const Position = z.object({
  symbol: z.string().trim().min(1, "Enter a ticker").max(12),
  kind: z.enum(["stock", "crypto"]).default("stock"),
  quantity: z.number().finite().positive("Quantity must be more than zero").max(1e12),
  /** Average price paid per share. Null clears it; omitted keeps the current one. */
  avgCost: z.number().finite().positive("Average cost must be more than zero").max(1e9).nullable().optional(),
})

/** Adds a position to a manual account, or changes how much of it is held. */
export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const account = await requireManualAccount(userId, id)
  if (account.category !== "investment") throw new ApiError("Positions can only be added to investment accounts")

  const parsed = Position.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid position")

  // The position's value arrives as a flow, exactly like a deposit: buying in
  // at today's price is not a gain.
  const before = await investableTotal(userId)
  await setPosition(id, userId, parsed.data)
  await writeDailySnapshot(userId, (await investableTotal(userId)) - before)
  await recordAccountEvent(userId, before, {
    action: "position_set",
    accountId: id,
    accountName: account.name,
    detail: { symbol: parsed.data.symbol.trim().toUpperCase(), quantity: parsed.data.quantity, avgCost: parsed.data.avgCost },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
})
