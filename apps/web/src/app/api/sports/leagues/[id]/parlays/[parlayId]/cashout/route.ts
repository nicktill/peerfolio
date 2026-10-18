import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { cashOutParlay, quoteParlayCashout } from "@web/lib/sports/parlay-cashout-store"
import { assertLeagueId, takeRateLimit } from "@web/lib/sports/store"

type Ctx = { params: Promise<{ id: string; parlayId: string }> }
const headers = { "Cache-Control": "private, no-store" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function ids(ctx: Ctx) {
  const { id, parlayId } = await ctx.params
  assertLeagueId(id)
  if (!UUID.test(parlayId)) throw new ApiError("Parlay not found", 404)
  return { id, parlayId }
}

/** What this parlay could be sold for right now. Read only. */
export const GET = withSportsUser<Ctx>(async (userId, _request, ctx) => {
  const { id, parlayId } = await ids(ctx)
  if (!(await takeRateLimit(db, "pick", userId))) throw new ApiError("Slow down a little, then try again.", 429)
  return NextResponse.json(await quoteParlayCashout(db, userId, id, parlayId), { headers })
})

const Sale = z.object({ expectedValue: z.number().int().positive("Missing cash-out price") })

/** Sells the parlay back at the quoted price. The price is recomputed on the server; a price that moved against the member is refused. */
export const POST = withSportsUser<Ctx>(async (userId, request, ctx) => {
  const { id, parlayId } = await ids(ctx)
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new ApiError("Forbidden", 403)
  if (!(await takeRateLimit(db, "pick", userId))) throw new ApiError("Slow down a little, then try again.", 429)
  const parsed = Sale.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request")
  const result = await cashOutParlay(db, userId, id, parlayId, parsed.data.expectedValue)
  return NextResponse.json({ cashout: { amount: result.amount } }, { status: result.replayed ? 200 : 201, headers })
})
