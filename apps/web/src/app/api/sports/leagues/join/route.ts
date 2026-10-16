import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { createLimiter } from "@web/lib/sports/rate-limit"
import { joinSportsLeague, JOIN_FAILED } from "@web/lib/sports/store"

// 8 attempts a minute per user: enough for typos, too slow to guess codes.
const limiter = createLimiter(8, 60_000)

const Join = z.object({ code: z.string().trim().min(4).max(16) })

export const POST = withSportsUser<unknown>(async (userId, request) => {
  if (!limiter.take(userId)) throw new ApiError("Too many tries. Wait a minute.", 429)
  const parsed = Join.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(JOIN_FAILED)
  const league = await joinSportsLeague(db, userId, parsed.data.code)
  return NextResponse.json({ league: { id: league.id } })
})
