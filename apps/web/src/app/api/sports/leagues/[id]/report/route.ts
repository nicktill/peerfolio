import { NextResponse } from "next/server"
import { db, withSportsUser } from "@web/lib/sports/api"
import { getMirroredPickReport } from "@web/lib/sports/store"

type Ctx = { params: Promise<{ id: string }> }

/** League owner only: members who keep taking opposite sides of the same locked market (possible credit funnelling). */
export const GET = withSportsUser<Ctx>(async (userId, _request, { params }) => {
  const { id } = await params
  return NextResponse.json({ pairs: await getMirroredPickReport(db, userId, id, new Date()) })
})
