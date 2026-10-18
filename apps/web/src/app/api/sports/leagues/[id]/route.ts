import { NextResponse } from "next/server"
import { db, withSportsUser } from "@web/lib/sports/api"
import { ApiError, readJson } from "@web/lib/api"
import { getSportsLeagueDetail, setLeagueMaxStakePct } from "@web/lib/sports/store"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withSportsUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  // Server time only; the client's clock is never consulted.
  return NextResponse.json(await getSportsLeagueDetail(db, userId, id, new Date()))
})

/** Owner-only league settings. Currently the largest single pick, as a percent of starting cash. */
export const PATCH = withSportsUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const body = (await readJson(request)) as { maxStakePct?: unknown }
  if (typeof body?.maxStakePct !== "number") throw new ApiError("Nothing to change")
  return NextResponse.json(await setLeagueMaxStakePct(db, userId, id, body.maxStakePct))
})
