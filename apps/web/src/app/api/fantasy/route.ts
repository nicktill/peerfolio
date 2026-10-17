import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { createFantasyLeague, listFantasyLeaguesForUser } from "@web/lib/fantasy"
import { loadRoundChips } from "@web/lib/fantasy-season-view"
import { ensureSeason, normalizeSeasonConfig } from "@web/lib/fantasy-seasons"
import { ACCENT_KEYS, isLeagueEmoji } from "@web/lib/league-look"

const CreateFantasyLeague = z.object({
  name: z.string().trim().min(2, "Name is too short").max(40, "Name is too long"),
  emoji: z.string().refine(isLeagueEmoji, "Pick an icon from the list").default("🏈"),
  accent: z.enum(ACCENT_KEYS).default("emerald"),
  startingCash: z.number().int().min(1_000).max(10_000_000).default(100_000),
  maxPositionPct: z.number().int().min(5).max(100).nullable().default(null),
  /** ISO timestamp, or null for a league that never ends. */
  endsAt: z.string().datetime().nullable().default(null),
  /** Weekly rounds: how the league plays. Defaults to an open-ended trading season. */
  season: z
    .object({
      mode: z.enum(["trading", "draft"]).default("trading"),
      rounds: z.number().int().min(1).max(52).nullable().default(null),
      picks: z.number().int().min(1).max(10).default(5),
    })
    .default({ mode: "trading", rounds: null, picks: 5 }),
})

export const GET = withUser<unknown>(async (userId) => {
  const leagues = await listFantasyLeaguesForUser(userId)
  const chips = await loadRoundChips(userId, leagues.map((l) => l.id)).catch((error) => {
    // The list still works without round chips, but a failure here should be seen.
    console.error("[fantasy] loading round chips failed:", error instanceof Error ? error.message : error)
    return new Map()
  })
  return NextResponse.json({ leagues: leagues.map((l) => ({ ...l, round: chips.get(l.id) ?? null })) })
})

export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = CreateFantasyLeague.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid league")

  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
  if (endsAt && endsAt.getTime() < Date.now() + 60 * 60 * 1000) throw new ApiError("Pick an end date at least an hour away")

  const { season, ...rules } = parsed.data
  const league = await createFantasyLeague(userId, { ...rules, endsAt })
  await ensureSeason(league.id, normalizeSeasonConfig(season))
  return NextResponse.json({ league: { id: league.id } }, { status: 201 })
})
