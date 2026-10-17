import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { placeTrade, requireFantasyMember } from "@web/lib/fantasy"
import { saveOrderNote, saveTradeNote } from "@web/lib/fantasy-notes"

type Ctx = { params: Promise<{ id: string }> }

const Trade = z.discriminatedUnion("side", [
  z.object({
    side: z.literal("buy"),
    symbol: z.string().trim().min(1).max(12),
    kind: z.enum(["stock", "crypto"]).default("stock"),
    amount: z.number().positive("Enter an amount to buy"),
    note: z.string().max(280, "Keep the note under 280 characters").optional(),
  }),
  z.object({
    side: z.literal("sell"),
    symbol: z.string().trim().min(1).max(12),
    kind: z.enum(["stock", "crypto"]).default("stock"),
    shares: z.union([z.number().positive("Enter how many shares to sell"), z.literal("all")]),
    note: z.string().max(280, "Keep the note under 280 characters").optional(),
  }),
])

export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const parsed = Trade.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid trade")
  const { note, ...order } = parsed.data
  const result = await placeTrade(userId, id, order)
  // "Why I picked this": best effort, the trade has already happened.
  if (note) {
    try {
      const { member } = await requireFantasyMember(userId, id)
      if ("queued" in result) await saveOrderNote(member.id, id, result.orderId, note)
      else await saveTradeNote(member.id, id, result.trade.id, note)
    } catch (error) {
      console.error("[fantasy] saving a trade note failed:", error instanceof Error ? error.message : error)
    }
  }
  // 202 when the market is closed and the order waits for the open.
  return NextResponse.json(result, { status: "queued" in result ? 202 : 201 })
})
