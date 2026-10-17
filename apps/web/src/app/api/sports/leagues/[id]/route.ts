import { NextResponse } from "next/server"
import { db, withSportsUser } from "@web/lib/sports/api"
import { getSportsLeagueDetail } from "@web/lib/sports/store"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withSportsUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  // Server time only; the client's clock is never consulted.
  return NextResponse.json(await getSportsLeagueDetail(db, userId, id, new Date()))
})
