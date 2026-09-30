import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { createFantasyLeague, listFantasyLeaguesForUser } from "@web/lib/fantasy"
import { ACCENT_KEYS, isLeagueEmoji } from "@web/lib/league-look"

const CreateFantasyLeague = z.object({
  name: z.string().trim().min(2, "Name is too short").max(40, "Name is too long"),
  emoji: z.string().refine(isLeagueEmoji, "Pick an icon from the list").default("🏈"),
  accent: z.enum(ACCENT_KEYS).default("emerald"),
  startingCash: z.number().int().min(1_000).max(10_000_000).default(100_000),
  maxPositionPct: z.number().int().min(5).max(100).nullable().default(null),
  /** ISO timestamp, or null for a league that never ends. */
  endsAt: z.string().datetime().nullable().default(null),
})

export const GET = withUser<unknown>(async (userId) => {
  return NextResponse.json({ leagues: await listFantasyLeaguesForUser(userId) })
})

export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = CreateFantasyLeague.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid league")

  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
  if (endsAt && endsAt.getTime() < Date.now() + 60 * 60 * 1000) throw new ApiError("Pick an end date at least an hour away")

  const league = await createFantasyLeague(userId, { ...parsed.data, endsAt })
  return NextResponse.json({ league: { id: league.id } }, { status: 201 })
})
