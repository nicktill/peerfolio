import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { joinFantasyLeague } from "@web/lib/fantasy"

const Join = z.object({ code: z.string().trim().min(4).max(16) })

export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = Join.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Enter an invite code")
  const league = await joinFantasyLeague(userId, parsed.data.code)
  return NextResponse.json({ league: { id: league.id } })
})
