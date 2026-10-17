import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { placeSportsPick, takeRateLimit } from "@web/lib/sports/store"

type Ctx = { params: Promise<{ id: string }> }

const Pick = z.object({
  lineId: z.string().uuid(),
  stake: z.number().int("Stake must be a whole number").positive("Enter a stake"),
  /** The line the user saw. A mismatch is refused, never silently re-priced. */
  expectedPrice: z.number().int(),
  expectedPoint: z.number().nullable(),
  /** Idempotency key generated once per slip, so a double tap places one pick. */
  requestId: z.string().min(8).max(64),
})

export const POST = withSportsUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  if (!(await takeRateLimit(db, "pick", userId))) throw new ApiError("Slow down a little, then try again.", 429)
  const parsed = Pick.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid pick")
  const { pick, replayed } = await placeSportsPick(db, userId, id, parsed.data, new Date())
  return NextResponse.json({ pick: { id: pick.id, stake: pick.stake, price: pick.price, point: pick.point, totalReturn: pick.totalReturn } }, { status: replayed ? 200 : 201 })
})
