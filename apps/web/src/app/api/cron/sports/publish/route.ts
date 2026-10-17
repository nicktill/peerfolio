import { NextResponse } from "next/server"
import { db, withSportsCron } from "@web/lib/sports/api"
import { buildOddsProvider, isMockMode } from "@web/lib/sports/providers"
import { EspnResultsProvider } from "@web/lib/sports/providers/espn"
import { DEFAULT_PUBLISH } from "@web/lib/sports/lines"
import { DbUsageStore, lockDueMarkets, makeFetchGate, pruneRateLimits, publishLines } from "@web/lib/sports/store"
import { publicationHealth } from "@web/lib/sports/health"
import { SPORTS } from "@web/lib/sports/types"

export const maxDuration = 120

/** Fetch once (cached, budgeted, merged), publish fixed lines for every league, close due markets. */
export const GET = withSportsCron<unknown>(async () => {
  const now = new Date()
  const provider = buildOddsProvider(new DbUsageStore(db))
  // Paid fetches only when a sport has an unlocked market or a game within 24h (free ESPN schedule), in 2h/12h buckets, so the
  // daily credit cap is not spent in the first two runs after midnight UTC. Off in mock mode and with SPORTS_FETCH_GATE=0.
  const espn = new EspnResultsProvider()
  const gate = isMockMode() || process.env.SPORTS_FETCH_GATE === "0" ? undefined : makeFetchGate(db, async (sport, at) => (process.env.ESPN_RESULTS_ENABLED === "1" ? espn.hasGameWithin(sport, at) : null))
  const published = await publishLines(db, provider, SPORTS, now, { ...DEFAULT_PUBLISH, tennisTotals: process.env.SPORTS_TENNIS_TOTALS === "1" }, gate)
  const locked = await lockDueMarkets(db, now)
  await pruneRateLimits(db, now)
  const health = publicationHealth(published)
  const summary = JSON.stringify({ job: "sports.publish", at: now.toISOString(), health, published, locked })
  if (health.httpStatus !== 200) console.error(summary)
  else if (health.status !== "ok") console.warn(summary)
  else console.info(summary)
  return NextResponse.json({ health, published, locked }, { status: health.httpStatus })
})
