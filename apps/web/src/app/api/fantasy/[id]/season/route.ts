import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { loadSeasonView } from "@web/lib/fantasy-season-view"
import { setRecapSharing, startNextSeason, wrapUpSeason } from "@web/lib/fantasy-seasons"

type Ctx = { params: Promise<{ id: string }> }

/** The league's season: current round, standings, archive, trophies, head to head and the latest recap. */
export const GET = withUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  return NextResponse.json(await loadSeasonView(userId, id))
})

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("next"),
    mode: z.enum(["trading", "draft"]).default("trading"),
    /** Null runs until you wrap it up. */
    rounds: z.number().int().min(1).max(52).nullable().default(null),
    picks: z.number().int().min(1).max(10).default(5),
  }),
  z.object({ action: z.literal("wrap") }),
  /** Turn the public recap link for a round off ("stop") or on again with a new link ("share"). */
  z.object({ action: z.enum(["share", "stop"]), round: z.number().int().min(1) }),
])

/** Owner only: start the next season (the rematch), or wrap the current one up after this round. */
export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const parsed = Action.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request")
  const body = parsed.data
  if (body.action !== "next") {
    if (body.action === "wrap") return NextResponse.json(await wrapUpSeason(userId, id))
    return NextResponse.json(await setRecapSharing(userId, id, body.round, body.action === "share"))
  }
  const season = await startNextSeason(userId, id, body)
  return NextResponse.json({ season: { number: season.number, mode: season.mode, startsAt: season.startsAt } }, { status: 201 })
})
