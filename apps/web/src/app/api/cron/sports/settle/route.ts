import { NextResponse } from "next/server"
import { ApiError } from "@web/lib/api"
import { db, withSportsCron } from "@web/lib/sports/api"
import { buildResultsProviders, resolveConfig } from "@web/lib/sports/providers"
import { DbUsageStore, lockDueMarkets, settleDueEvents } from "@web/lib/sports/store"

export const maxDuration = 120

export const GET = withSportsCron<unknown>(async () => {
  const now = new Date()
  const locked = await lockDueMarkets(db, now)
  const providers = buildResultsProviders()
  const config = resolveConfig()
  const families = new Set(providers.map((p) => p.family ?? p.name)).size
  if (families < config.minSources) {
    console.error(JSON.stringify({ job: "sports.settle", status: "misconfigured", families, required: config.minSources }))
    throw new ApiError("Not enough independent results providers configured", 503)
  }
  const settled = await settleDueEvents(db, providers, now, config, new DbUsageStore(db))
  const status = settled.failedSources > 0 ? "degraded" : "ok"
  const summary = JSON.stringify({ job: "sports.settle", at: now.toISOString(), status, locked, settled })
  if (settled.failedSources > 0) console.error(summary)
  else console.info(summary)
  return NextResponse.json({ status, locked, settled }, { status: settled.failedSources > 0 ? 503 : 200 })
})
