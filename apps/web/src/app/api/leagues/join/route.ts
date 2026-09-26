import { NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db, leagueMembers, leagues } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"

export const POST = withUser<unknown>(async (userId, request) => {
  const { code } = await readJson<{ code?: string }>(request)
  if (!code?.trim()) throw new ApiError("Enter an invite code")

  const league = await db.query.leagues.findFirst({
    where: eq(leagues.inviteCode, code.trim().toUpperCase()),
  })
  if (!league) throw new ApiError("That invite code doesn't match a league", 404)
  if (league.isArchived) throw new ApiError("That league is closed", 410)

  const existing = await db.query.leagueMembers.findFirst({
    where: (m, { and, eq: e }) => and(e(m.leagueId, league.id), e(m.userId, userId)),
  })
  if (existing) return NextResponse.json({ league: { id: league.id, name: league.name }, alreadyMember: true })

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, league.id))

  if ((count ?? 0) >= league.memberLimit) throw new ApiError("This league is full", 409)

  await db.insert(leagueMembers).values({ leagueId: league.id, userId })

  return NextResponse.json({ league: { id: league.id, name: league.name }, alreadyMember: false })
})
