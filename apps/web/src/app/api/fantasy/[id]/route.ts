import { NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, fantasyLeagues } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { loadFantasyLeague, requireFantasyMember, updateFantasyLeague } from "@web/lib/fantasy"
import { ACCENT_KEYS, isLeagueEmoji } from "@web/lib/league-look"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  return NextResponse.json(await loadFantasyLeague(userId, id))
})

/** `.strict()` so an attempt to change starting cash or the pick cap is an error, not silently ignored. */
const UpdateFantasyLeague = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(40, "Name is too long").optional(),
    emoji: z.string().refine(isLeagueEmoji, "Pick an icon from the list").optional(),
    accent: z.enum(ACCENT_KEYS).optional(),
    /** Later than the current end, or null to run forever. */
    endsAt: z.string().datetime().nullable().optional(),
  })
  .strict()

export const PATCH = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const parsed = UpdateFantasyLeague.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid change")
  const { endsAt, ...rest } = parsed.data
  const league = await updateFantasyLeague(userId, id, { ...rest, ...(endsAt !== undefined && { endsAt: endsAt === null ? null : new Date(endsAt) }) })
  return NextResponse.json({ league })
})

export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  const { league } = await requireFantasyMember(userId, id)
  if (league.ownerId !== userId) throw new ApiError("Only the league owner can delete it", 403)
  await db.delete(fantasyLeagues).where(eq(fantasyLeagues.id, id))
  return NextResponse.json({ ok: true })
})
