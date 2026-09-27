import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db, fantasyLeagues } from "@web/db"
import { ApiError, withUser } from "@web/lib/api"
import { loadFantasyLeague, requireFantasyMember } from "@web/lib/fantasy"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  return NextResponse.json(await loadFantasyLeague(userId, id))
})

export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  const { league } = await requireFantasyMember(userId, id)
  if (league.ownerId !== userId) throw new ApiError("Only the league owner can delete it", 403)
  await db.delete(fantasyLeagues).where(eq(fantasyLeagues.id, id))
  return NextResponse.json({ ok: true })
})
