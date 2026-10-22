import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { resetSportsMember } from "@web/lib/sports/admin-reset"
import { SportsError } from "@web/lib/sports/store"

export const GET = withUser<unknown>(async (actorId, request) => {
  await assertAdmin(actorId)
  const userId = new URL(request.url).searchParams.get("userId")
  if (!z.string().uuid().safeParse(userId).success) throw new ApiError("Choose a user", 400)
  const members = await db.execute(sql`SELECT m.id, l.name AS league, m.credits, l.starting_credits AS "startingCredits",
    (SELECT count(*)::int FROM sports_picks WHERE member_id = m.id) AS picks,
    (SELECT count(*)::int FROM sports_parlays WHERE member_id = m.id) AS parlays,
    ((SELECT count(*) FROM sports_picks WHERE member_id = m.id AND status = 'open') +
     (SELECT count(*) FROM sports_parlays WHERE member_id = m.id AND status = 'open'))::int AS open
    FROM sports_members m JOIN sports_leagues l ON l.id = m.league_id WHERE m.user_id = ${userId} ORDER BY l.name, m.id`)
  return NextResponse.json({ members }, { headers: { "Cache-Control": "no-store" } })
})

const Input = z.object({ memberId: z.string().uuid(), requestId: z.string().uuid(), expectedCredits: z.number().int().nonnegative() }).strict()
export const POST = withUser<unknown>(async (actorId, request) => {
  await assertAdmin(actorId)
  const parsed = Input.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Expected an exact sports member and reviewed balance", 400)
  try {
    return NextResponse.json(await resetSportsMember(db, actorId, parsed.data), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof SportsError) throw new ApiError(error.message, error.status)
    throw error
  }
})
