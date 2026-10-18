import { NextResponse } from "next/server"
import { db, withSportsUser } from "@web/lib/sports/api"
import { ApiError, readJson } from "@web/lib/api"
import { getSportsLeagueDetail, setLeagueMaxStakePct } from "@web/lib/sports/store"
import { setLeagueLiveBetting } from "@web/lib/sports/live-store"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withSportsUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  // Server time only; the client's clock is never consulted.
  return NextResponse.json(await getSportsLeagueDetail(db, userId, id, new Date()))
})

/** Owner-only league settings. The largest single pick (percent of starting cash) and whether live picks are allowed. */
export const PATCH = withSportsUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const body = (await readJson(request)) as { maxStakePct?: unknown; liveBetting?: unknown }
  const result: Record<string, unknown> = {}
  if (typeof body?.maxStakePct === "number") Object.assign(result, await setLeagueMaxStakePct(db, userId, id, body.maxStakePct))
  if (typeof body?.liveBetting === "boolean") Object.assign(result, await setLeagueLiveBetting(db, userId, id, body.liveBetting))
  if (!Object.keys(result).length) throw new ApiError("Nothing to change")
  return NextResponse.json(result)
})
