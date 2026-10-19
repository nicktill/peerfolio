import { NextResponse } from "next/server"
import { z } from "zod"
import { db, withSportsUser } from "@web/lib/sports/api"
import { ApiError, readJson } from "@web/lib/api"
import { getSportsLeagueDetail, setLeagueMaxStakePct, updateSportsLeague } from "@web/lib/sports/store"
import { ACCENT_KEYS, isLeagueEmoji } from "@web/lib/league-look"
import { setLeagueLiveBetting } from "@web/lib/sports/live-store"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withSportsUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  // Server time only; the client's clock is never consulted.
  return NextResponse.json(await getSportsLeagueDetail(db, userId, id, new Date()))
})

/** `.strict()` so a field that cannot change (starting cash, invite code) is an error, not silently ignored. */
const Patch = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(40, "Name is too long").optional(),
    emoji: z.string().refine(isLeagueEmoji, "Pick an icon from the list").optional(),
    accent: z.enum(ACCENT_KEYS).optional(),
    /** Later than the current end, or null to run forever. */
    endsAt: z.string().datetime().nullable().optional(),
    maxStakePct: z.number().optional(),
    /** Null follows the single-pick limit. */
    maxParlayStakePct: z.number().nullable().optional(),
    liveBetting: z.boolean().optional(),
    sports: z.array(z.string()).optional(),
  })
  .strict()

/** Owner-only league settings: name and look, end date, the single and parlay pick limits, live picks, and the sports on offer. */
export const PATCH = withSportsUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const parsed = Patch.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Nothing to change")
  const { maxStakePct, liveBetting, endsAt, ...rest } = parsed.data
  const result: Record<string, unknown> = {}
  if (Object.keys(rest).length || endsAt !== undefined) {
    Object.assign(result, await updateSportsLeague(db, userId, id, { ...rest, ...(endsAt !== undefined && { endsAt: endsAt === null ? null : new Date(endsAt) }) }))
  }
  if (maxStakePct !== undefined) Object.assign(result, await setLeagueMaxStakePct(db, userId, id, maxStakePct))
  if (liveBetting !== undefined) Object.assign(result, await setLeagueLiveBetting(db, userId, id, liveBetting))
  if (!Object.keys(result).length) throw new ApiError("Nothing to change")
  return NextResponse.json(result)
})
