import { NextResponse } from "next/server"
import { db, withSportsCron } from "@web/lib/sports/api"
import { buildExchangeOdds, buildOddsProvider, enabledSports, publishMode } from "@web/lib/sports/providers"
import { EspnResultsProvider } from "@web/lib/sports/providers/espn"
import { DEFAULT_PUBLISH, EXCHANGE_PUBLISH } from "@web/lib/sports/lines"
import { DbUsageStore, freezeUnguardedMarkets, lockDueMarkets, makeDbCallCap, makeExchangeGate, makeFetchGate, pruneRateLimits, publishLines } from "@web/lib/sports/store"
import { publicationHealth } from "@web/lib/sports/health"
import { enabledSports as unpaused } from "@web/lib/sports/enabled"
import { activeSports } from "@web/lib/sports/flag"
import { writeHeartbeat } from "@web/lib/sports/live/store"
import { leagueSportsSql } from "@web/lib/sports/ingestion-scope"
import { hiddenSkips } from "@web/lib/sports/health-report"
import { quietOffSlot } from "@web/lib/sports/live/slots"

export const maxDuration = 120

/** Fetch once (cached, rate-capped, merged), publish fixed lines for every league, close due markets. */
export const GET = withSportsCron<unknown>(async (request) => {
  const now = new Date()
  // Quiet hours: only the top-of-hour run publishes, before any database access (see live/slots.ts). ?force=1 runs anyway.
  if (quietOffSlot(now.getTime()) && new URL(request.url).searchParams.get("force") !== "1") return NextResponse.json({ status: "skipped", reason: "quiet_hours" })
  // Leave room under maxDuration for lock/guard/prune after the fetches: sports not reached are skipped (and their claim kept for the next run).
  const deadlineAt = Date.now() + 90_000
  const mode = publishMode()
  const tennisTotals = process.env.SPORTS_TENNIS_TOTALS === "1"
  const tracked = await db.execute<{ sport: string }>(leagueSportsSql(now))
  const wanted = new Set([...tracked].map((row) => row.sport))
  const sports = unpaused(enabledSports(activeSports())).filter((sport) => wanted.has(sport))
  let provider
  let cfg
  let gate
  if (mode === "exchange") {
    // Free path: Polymarket prices on ESPN's schedule. Nothing here reads or writes Odds API credits. A sport is fetched only if it
    // has an unlocked market or ESPN lists a game inside the publish window, at most once per 30 minutes (see makeExchangeGate).
    const built = buildExchangeOdds(makeDbCallCap(db))
    provider = built.provider
    cfg = { ...EXCHANGE_PUBLISH, tennisTotals }
    gate = makeExchangeGate(db, (sport, at) => built.exchange.hasGameWithin(sport, at))
  } else {
    provider = buildOddsProvider(new DbUsageStore(db))
    cfg = { ...DEFAULT_PUBLISH, tennisTotals }
    // Paid fetches only when a sport has an unlocked market or a game within 24h (free ESPN schedule), in 2h/12h buckets, so the
    // daily credit cap is not spent in the first two runs after midnight UTC. Off in mock mode and with SPORTS_FETCH_GATE=0.
    const espn = new EspnResultsProvider()
    gate = mode === "mock" || process.env.SPORTS_FETCH_GATE === "0" ? undefined : makeFetchGate(db, async (sport, at) => (process.env.ESPN_RESULTS_ENABLED === "1" ? espn.hasGameWithin(sport, at) : null))
  }
  const published = await publishLines(db, provider, sports, now, cfg, gate, deadlineAt)
  const locked = await lockDueMarkets(db, now)
  // Exchange-managed markets must not sit unguarded when the live odds worker is not beating (see store.freezeUnguardedMarkets).
  const unguarded = await freezeUnguardedMarkets(db, now)
  await pruneRateLimits(db, now)
  const health = publicationHealth(published)
  // Run record for the admin health page (one overwritten row). Never allowed to fail the job.
  await writeHeartbeat(db, { name: "sports-publish", at: now, ok: health.httpStatus === 200, consecutiveFailures: 0, details: { status: health.status, mode, failedSports: health.failedSports, locked, unguarded, hidden: hiddenSkips(published) } }).catch(() => undefined)
  const summary = JSON.stringify({ job: "sports.publish", at: now.toISOString(), mode, health, published, locked, unguarded })
  if (health.httpStatus !== 200) console.error(summary)
  else if (health.status !== "ok") console.warn(summary)
  else console.info(summary)
  return NextResponse.json({ health, published, locked, unguarded }, { status: health.httpStatus })
})
