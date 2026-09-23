import { NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db, leagueMembers, leagues } from "@web/db"
import { ApiError, withUser } from "@web/lib/api"
import { requireMembership } from "@web/lib/social"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  const { league } = await requireMembership(userId, id)

  if (league.ownerId === userId) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, id))

    // Leaving as the last member deletes the league rather than orphaning it.
    if ((count ?? 0) > 1) {
      throw new ApiError("Hand the league to another member before leaving", 409)
    }
    await db.delete(leagues).where(eq(leagues.id, id))
    return NextResponse.json({ ok: true, deleted: true })
  }

  await db.delete(leagueMembers).where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)))
  return NextResponse.json({ ok: true, deleted: false })
})
