import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { PARLAY_LIMITS } from "@web/lib/sports/parlay"
import { placeSportsParlay, takeRateLimit } from "@web/lib/sports/store"

type Ctx = { params: Promise<{ id: string }> }

const Parlay = z.object({
  legs: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        /** The line the user saw. A mismatch is refused, never silently re-priced. */
        expectedPrice: z.number().int(),
        expectedPoint: z.number().nullable(),
      }),
    )
    .min(PARLAY_LIMITS.minLegs, `A parlay needs at least ${PARLAY_LIMITS.minLegs} legs`)
    .max(PARLAY_LIMITS.maxLegs, `A parlay can have at most ${PARLAY_LIMITS.maxLegs} legs`),
  stake: z.number().int("Stake must be a whole number").positive("Enter a stake"),
  /** Idempotency key generated once per slip, so a double tap places one parlay. */
  requestId: z.string().min(8).max(64),
})

export const POST = withSportsUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  if (!(await takeRateLimit(db, "pick", userId))) throw new ApiError("Slow down a little, then try again.", 429)
  const parsed = Parlay.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid parlay")
  const { parlay } = await placeSportsParlay(db, userId, id, parsed.data)
  return NextResponse.json({ parlay })
})
