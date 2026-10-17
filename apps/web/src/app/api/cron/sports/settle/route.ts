import { NextResponse } from "next/server"
import { db, withSportsCron } from "@web/lib/sports/api"
import { buildResultsProviders, resolveConfig } from "@web/lib/sports/providers"
import { lockDueMarkets, settleDueEvents } from "@web/lib/sports/store"

export const maxDuration = 120

export const GET = withSportsCron<unknown>(async () => {
  const now = new Date()
  const locked = await lockDueMarkets(db, now)
  const settled = await settleDueEvents(db, buildResultsProviders(), now, resolveConfig())
  return NextResponse.json({ locked, settled })
})
