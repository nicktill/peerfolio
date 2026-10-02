import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { placeTrade } from "@web/lib/fantasy"

type Ctx = { params: Promise<{ id: string }> }

const Trade = z.discriminatedUnion("side", [
  z.object({
    side: z.literal("buy"),
    symbol: z.string().trim().min(1).max(12),
    kind: z.enum(["stock", "crypto"]).default("stock"),
    amount: z.number().positive("Enter an amount to buy"),
  }),
  z.object({
    side: z.literal("sell"),
    symbol: z.string().trim().min(1).max(12),
    kind: z.enum(["stock", "crypto"]).default("stock"),
    shares: z.union([z.number().positive("Enter how many shares to sell"), z.literal("all")]),
  }),
])

export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const parsed = Trade.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid trade")
  const result = await placeTrade(userId, id, parsed.data)
  // 202 when the market is closed and the order waits for the open.
  return NextResponse.json(result, { status: "queued" in result ? 202 : 201 })
})
