import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson } from "@web/lib/api"
import { ACCENT_KEYS, isLeagueEmoji } from "@web/lib/league-look"
import { db, withSportsUser } from "@web/lib/sports/api"
import { createSportsLeague, listSportsLeagues, takeRateLimit } from "@web/lib/sports/store"
import { isSportEnabled, pausedMessage } from "@web/lib/sports/enabled"
import { SPORTS } from "@web/lib/sports/types"
import { activeSports } from "@web/lib/sports/flag"

const CreateSportsLeague = z.object({
  name: z.string().trim().min(2, "Name is too short").max(40, "Name is too long"),
  emoji: z.string().refine(isLeagueEmoji, "Pick an icon from the list").default("🏈"),
  accent: z.enum(ACCENT_KEYS).default("emerald"),
  sports: z.array(z.enum(SPORTS as [string, ...string[]])).min(1, "Pick at least one sport").max(SPORTS.length),
  startingCredits: z.number().int().min(100).max(100_000).default(1_000),
  endsAt: z.string().datetime().nullable().default(null),
})

export const GET = withSportsUser<unknown>(async (userId) => {
  return NextResponse.json({ leagues: await listSportsLeagues(db, userId) })
})

export const POST = withSportsUser<unknown>(async (userId, request) => {
  if (!(await takeRateLimit(db, "create", userId))) throw new ApiError("You've started a lot of leagues. Try again later.", 429)
  const parsed = CreateSportsLeague.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid league")
  const paused = parsed.data.sports.find((s) => !isSportEnabled(s))
  if (paused) throw new ApiError(pausedMessage(paused), 409)
  // A sport behind a flag that is off (men's college basketball outside its season) cannot be chosen yet.
  const offered = new Set<string>(activeSports())
  if (parsed.data.sports.some((s) => !offered.has(s))) throw new ApiError("That sport is not available yet")
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
  if (endsAt && endsAt.getTime() < Date.now() + 60 * 60 * 1000) throw new ApiError("Pick an end date at least an hour away")
  const league = await createSportsLeague(db, userId, {
    ...parsed.data,
    sports: [...new Set(parsed.data.sports)] as import("@web/lib/sports/types").Sport[],
    endsAt,
  })
  return NextResponse.json({ league: { id: league.id } }, { status: 201 })
})
