import { NextResponse } from "next/server"
import { db, withSportsCron } from "@web/lib/sports/api"
import { buildOddsProvider } from "@web/lib/sports/providers"
import { DbUsageStore, lockDueMarkets, publishLines } from "@web/lib/sports/store"
import { SPORTS } from "@web/lib/sports/types"

export const maxDuration = 120

/** Fetch once (cached, budgeted, merged), publish fixed lines for every league, close due markets. */
export const GET = withSportsCron<unknown>(async () => {
  const now = new Date()
  const provider = buildOddsProvider(new DbUsageStore(db))
  const published = await publishLines(db, provider, SPORTS, now)
  const locked = await lockDueMarkets(db, now)
  return NextResponse.json({ published, locked })
})
