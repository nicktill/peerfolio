import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { joinSportsLeague } from "@web/lib/sports/store"

const Join = z.object({ code: z.string().trim().min(4).max(16) })

export const POST = withSportsUser<unknown>(async (userId, request) => {
  const parsed = Join.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Enter an invite code")
  const league = await joinSportsLeague(db, userId, parsed.data.code)
  return NextResponse.json({ league: { id: league.id } })
})
