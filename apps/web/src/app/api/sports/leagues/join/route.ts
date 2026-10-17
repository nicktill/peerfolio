import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { joinSportsLeague, JOIN_FAILED, takeRateLimit } from "@web/lib/sports/store"

const Join = z.object({ code: z.string().trim().min(4).max(16) })

export const POST = withSportsUser<unknown>(async (userId, request) => {
  if (!(await takeRateLimit(db, "join", userId))) throw new ApiError("Too many tries. Wait a minute.", 429)
  const parsed = Join.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(JOIN_FAILED)
  const league = await joinSportsLeague(db, userId, parsed.data.code)
  return NextResponse.json({ league: { id: league.id } })
})
