import { NextResponse } from "next/server"
import { ApiError } from "@web/lib/api"
import { db, withSportsCron } from "@web/lib/sports/api"
import { buildResultsProviders, resolveConfigFor, sportsWithoutQuorum } from "@web/lib/sports/providers"
import { SPORTS } from "@web/lib/sports/types"
import { writeHeartbeat } from "@web/lib/sports/live/store"
import { DbUsageStore, lockDueMarkets, settleDueEvents } from "@web/lib/sports/store"

export const maxDuration = 120

export const GET = withSportsCron<unknown>(async () => {
  const now = new Date()
  const locked = await lockDueMarkets(db, now)
  const providers = buildResultsProviders()
  const config = resolveConfigFor(providers)
  // Per sport: the free default needs one family (ESPN) for most sports and two for NHL/MLB, and degrades to one if a second
  // source is switched off. Only "no source at all" or an explicit SPORTS_MIN_RESULT_SOURCES nobody can meet is a misconfiguration.
  const short = sportsWithoutQuorum(providers, SPORTS)
  if (short.length === SPORTS.length) {
    console.error(JSON.stringify({ job: "sports.settle", status: "misconfigured", sportsWithoutQuorum: short }))
    throw new ApiError("Not enough independent results providers configured", 503)
  }
  if (short.length) console.error(JSON.stringify({ job: "sports.settle", status: "partial", sportsWithoutQuorum: short }))
  const settled = await settleDueEvents(db, providers, now, config, new DbUsageStore(db))
  const status = settled.failedSources > 0 ? "degraded" : "ok"
  await writeHeartbeat(db, { name: "sports-settle", at: now, ok: settled.failedSources === 0, consecutiveFailures: 0, details: { status, locked, settled } }).catch(() => undefined)
  const summary = JSON.stringify({ job: "sports.settle", at: now.toISOString(), status, locked, settled })
  if (settled.failedSources > 0) console.error(summary)
  else console.info(summary)
  return NextResponse.json({ status, locked, settled }, { status: settled.failedSources > 0 ? 503 : 200 })
})
