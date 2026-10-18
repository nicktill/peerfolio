import { NextResponse } from "next/server"
import { ApiError } from "@web/lib/api"
import { db, withSportsCron } from "@web/lib/sports/api"
import { buildResultsProviders, resolveConfigFor, sportsWithoutQuorum } from "@web/lib/sports/providers"
import { SPORTS } from "@web/lib/sports/types"
import { settleEventNow } from "@web/lib/sports/settle-now"
import { eventTriggersEnabled } from "@web/lib/sports/settle-trigger"
import { writeHeartbeat } from "@web/lib/sports/live/store"
import { DbUsageStore, lockDueMarkets, settleDueEvents } from "@web/lib/sports/store"

export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withSportsCron<unknown>(async (request) => {
  const now = new Date()
  // Targeted run for one event, asked for by a fast signal (the live worker). Same settle logic, shared per-event rate limit;
  // it does not lock markets, sweep voids or touch the cron heartbeat, which keeps meaning "the full pass ran".
  const url = new URL(request.url)
  const eventId = url.searchParams.get("eventId")
  if (eventId) {
    if (!UUID.test(eventId)) throw new ApiError("Bad eventId", 400)
    if (!eventTriggersEnabled()) return NextResponse.json({ status: "disabled" })
    const kind = url.searchParams.get("kind") === "probe" ? "probe" : "final"
    const outcome = await settleEventNow(db, eventId, kind, now)
    console.info(JSON.stringify({ job: "sports.settle.event", at: now.toISOString(), eventId, kind, outcome }))
    return NextResponse.json({ status: outcome.ran ? "ok" : "skipped", outcome })
  }
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
