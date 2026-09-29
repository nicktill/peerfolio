import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, leagueMembers, leagues } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { scheduleLiveRefresh } from "@web/lib/live-quotes"
import { refreshStalePrices } from "@web/lib/positions"
import { buildLeagueStandings, requireMembership } from "@web/lib/social"
import { isRange, type Range } from "@web/lib/returns"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const { league, membership } = await requireMembership(userId, id)

  const rangeParam = new URL(request.url).searchParams.get("range") ?? "1M"
  const range: Range = isRange(rangeParam) ? rangeParam : "1M"

  // Standings end on today's live value; bring prices up to date first.
  await refreshStalePrices()
  scheduleLiveRefresh()
  const standings = await buildLeagueStandings(id, userId, range)

  return NextResponse.json({
    league: {
      id: league.id,
      name: league.name,
      description: league.description,
      emoji: league.emoji,
      accent: league.accent,
      // Only members can see the code, and only the owner can rotate it.
      inviteCode: league.inviteCode,
      isOwner: league.ownerId === userId,
    },
    you: { shareHoldings: membership.shareHoldings },
    standings,
    range,
  })
})

const UpdateLeague = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  description: z.string().trim().max(160).nullable().optional(),
  emoji: z.string().trim().min(1).max(8).optional(),
  accent: z.enum(["emerald", "violet", "amber", "sky", "rose"]).optional(),
  shareHoldings: z.boolean().optional(),
})

export const PATCH = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const { league } = await requireMembership(userId, id)

  const parsed = UpdateLeague.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid update")

  const { shareHoldings, ...leagueFields } = parsed.data

  // Any member controls their own sharing; only the owner edits the league.
  if (shareHoldings !== undefined) {
    await db
      .update(leagueMembers)
      .set({ shareHoldings })
      .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)))
  }

  if (Object.keys(leagueFields).length > 0) {
    if (league.ownerId !== userId) throw new ApiError("Only the league owner can change this", 403)
    await db.update(leagues).set(leagueFields).where(eq(leagues.id, id))
  }

  return NextResponse.json({ ok: true })
})

export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  const { league } = await requireMembership(userId, id)

  if (league.ownerId !== userId) throw new ApiError("Only the league owner can delete it", 403)

  await db.delete(leagues).where(eq(leagues.id, id))
  return NextResponse.json({ ok: true })
})
