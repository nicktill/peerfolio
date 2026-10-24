/**
 * Live odds ingest worker. A standalone, persistent process (Fly.io, Railway, a VPS; NOT a Vercel function).
 *
 * While a game is on the field it polls every 10s: the public Polymarket REST endpoints for just those games (Gamma list
 * for score/period/clock, one batched CLOB /books call for the order books; Kalshi and ESPN as cross-check/fallback every
 * 30s) and writes `live_quote` / `live_state`. Users only ever read those tables through /api/sports/live/[gameId], so
 * upstream calls scale with the number of live games, never with viewers.
 *
 * With nothing live it SLEEPS until 10 minutes before the next scheduled start (at most 15 minutes, or an hour in quiet hours
 * when nothing starts within the repricing window plus an hour; see live/slots.ts) and touches the database only once per
 * wake-up, so a serverless Postgres (Neon) can suspend between games.
 *
 * It never touches picks, the ledger or settlement; those keep using the independent results feeds. Besides the live
 * display it reprices and freezes pregame markets (reprice-pass.ts) and locks markets due at kickoff while a game is on.
 *
 *   DATABASE_URL=postgres://... node --experimental-strip-types scripts/live-odds-worker.mts [--ws] [--once]
 *
 *   --ws     also stream Polymarket's market WebSocket and prefer its books when younger than 5s (REST remains the fallback)
 *   --once   run a single cycle and exit (smoke test / cron-style use); exits 1 if that cycle failed
 *
 * Env: DATABASE_URL (required); LIVE_ODDS_WS=1 (same as --ws); LIVE_ODDS_ENABLED=0 (off switch: idles without touching
 * the database); LIVE_ODDS_BOOK_TS=fetch (trust fetch time for quiet books, see bookClock in plan.ts; default strict).
 *
 * Output: one JSON object per line (level info/warn/error). Exits 1 after 6 consecutive total failures so a supervisor
 * restarts it. Run exactly one replica (a second would only duplicate rows).
 */
import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { cycleFailed, EXIT_AFTER_FAILURES, shouldExit, WORKER_NAME } from "../src/lib/sports/live/health.ts"
import { clip, emit, type Fields, type Level } from "../src/lib/sports/log.ts"
import { idleSleepMs, isQuiet, MAX_SLEEP_MS, pollDelay, quietRefreshAt } from "../src/lib/sports/live/plan.ts"
import { insertQuotes, loadLiveSlate, type LiveSlate, nextStartAfter, nextTrackedStartAfter, pruneLiveQuotes, readSportsActivity, upsertState, writeHeartbeat } from "../src/lib/sports/live/store.ts"
import { applyReprice, confirmExchange, freezeForReason, listRepriceTargets, lockDueMarkets, recoverFrozenMarket } from "../src/lib/sports/store.ts"
import { inQuietHours, msToNextSlot, QUIET_SLOT_MS } from "../src/lib/sports/live/slots.ts"
import { REPRICE } from "../src/lib/sports/reprice-config.ts"
import { runRepricePass } from "../src/lib/sports/live/reprice-pass.ts"
import { MarketSocket } from "../src/lib/sports/live/ws.ts"
import { WATCH_POLL_MS, WatchSignal } from "../src/lib/sports/live/watch-signal.ts"
import type { PassResult } from "../src/lib/sports/live/reprice-pass.ts"
import { newWorkerState, runTick, type TickResult, type WorkerDeps } from "../src/lib/sports/live/worker.ts"

config({ path: ".env.local" })
config({ path: ".env" })

const out = (level: Level, ev: string, fields?: Fields) => emit(level, ev, { worker: WORKER_NAME, ...fields })

if (process.env.LIVE_ODDS_ENABLED !== "1") {
  // Off switch: no database, no upstream. Sleep long instead of exiting, so a supervisor does not restart-loop it.
  out("info", "live.disabled", { note: "LIVE_ODDS_ENABLED is not 1; idling without touching the database. This worker acts on open markets in DATABASE_URL, so it must be switched on deliberately." })
  if (process.argv.includes("--once")) process.exit(0)
  setInterval(() => {}, MAX_SLEEP_MS)
  await new Promise(() => {})
}

const url = process.env.DATABASE_URL
if (!url) {
  out("error", "live.fatal", { reason: "DATABASE_URL is not set" })
  process.exit(1)
}
const once = process.argv.includes("--once")
const useWs = process.argv.includes("--ws") || process.env.LIVE_ODDS_WS === "1"
const bookMode = process.env.LIVE_ODDS_BOOK_TS === "fetch" ? "fetch" : "strict"

const sql = postgres(url, { max: 2, prepare: false })
const db = drizzle(sql, { schema })
const socket = useWs ? new MarketSocket((m) => out("info", "live.ws", { msg: clip(m) })) : null

const UA = { "user-agent": "peerfolio-live-odds/0.1", accept: "application/json" }
async function request(input: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(input, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, // A Gamma games page carries every market of its events (measured 8 to 20 MB for 100 events), so it gets longer than the small CLOB/Kalshi calls.
    signal: AbortSignal.timeout(String(input).includes("gamma-api") ? 25_000 : 8_000) })
  if (!res.ok) throw new Error(`${res.status} ${new URL(input).hostname}${new URL(input).pathname}`)
  return res.json()
}

// Fast settle triggers: ask the app to run a targeted settle pass for one event (needs APP_URL and CRON_SECRET; absent means off).
const appUrl = process.env.APP_URL?.replace(/\/$/, "")
const cronSecret = process.env.CRON_SECRET
async function triggerSettle(eventId: string, kind: "final" | "probe"): Promise<{ done: boolean }> {
  const res = await fetch(`${appUrl}/api/cron/sports/settle?eventId=${encodeURIComponent(eventId)}&kind=${kind}`, { headers: { authorization: `Bearer ${cronSecret}` }, signal: AbortSignal.timeout(90_000) })
  if (!res.ok) throw new Error(`settle trigger ${res.status}`)
  const body = (await res.json()) as { outcome?: { ran?: boolean; settled?: number; voided?: number; review?: number; reason?: string } }
  const o = body.outcome
  out("info", "live.settle_trigger_result", { eventId, kind, outcome: o ?? null })
  // An event with no open markets left (already settled by the cron or a viewer) ends the series too.
  return { done: !!o && ((o.ran === true && (o.settled ?? 0) + (o.voided ?? 0) + (o.review ?? 0) > 0) || o.reason === "no_open_markets" || o.reason === "budget_spent") }
}

// Wake signal: while sleeping, ask the app (data cache, never the database) whether someone just opened sports, so live odds and the
// fast repricing pass resume within one poll instead of at the next slot. Without APP_URL and CRON_SECRET the worker keeps its slots.
const watch = appUrl && cronSecret
  ? new WatchSignal(async () => {
      const res = await fetch(`${appUrl}/api/sports/watch`, { headers: { authorization: `Bearer ${cronSecret}` }, signal: AbortSignal.timeout(5_000) })
      if (!res.ok) return null
      const body = (await res.json()) as { mark?: unknown }
      return typeof body.mark === "string" ? body.mark : null
    })
  : null

/**
 * Quiet mode. A game stays on the slate while only an open pick rides on it (nobody on the sports pages). Writing a quote every 10 s for
 * nobody keeps Neon awake (it suspends only after about 5 idle minutes, and compute time is what the free plan counts). So when the slate
 * was loaded as "not watched", the worker keeps polling upstream in memory (fast settle triggers still fire; they call the app, not the
 * database) but stores nothing and reads nothing from the database until the next shared quarter-hour slot, a viewer shows up (the watch signal),
 * or a kickoff needs its market locked. The heartbeat announces the quiet period (details.quiet, sleepUntil), so health and the publish
 * guard treat it as sleep, not silence.
 */
let cached: { rows: LiveSlate; watched: boolean; at: number } | null = null
let quiet = false
const kickoffLocked = new Set<string>()
const quietNow = (now: number) => isQuiet(cached, now, !!watch, kickoffLocked)
const modeCycles = { watched: 0, unwatchedLoaded: 0, quiet: 0 }
let lastModeLog = Date.now()

const deps: WorkerDeps = {
  store: {
    // Quiet mode (see quietNow): serve the slate loaded earlier and store nothing, so the database can suspend between refreshes.
    loadSlate: async (now) => {
      if (quiet && cached) return cached.rows
      const rows = await loadLiveSlate(db, now)
      cached = { rows, watched: rows.watched, at: Date.now() }
      return rows
    },
    insertQuotes: async (rows) => { if (!quiet) await insertQuotes(db, rows) },
    upsertState: async (eventId, state) => { if (!quiet) await upsertState(db, eventId, state) },
  },
  getJson: (u) => request(u),
  postJson: (u, body) => request(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  reprice: {
    listTargets: (now) => listRepriceTargets(db, now),
    apply: (marketId, basis, decision, now) => applyReprice(db, marketId, basis, decision, now),
    freeze: (marketId, reason) => freezeForReason(db, marketId, reason),
    recover: (marketId, expected, decision, now) => recoverFrozenMarket(db, marketId, expected, decision, now),
    confirm: (ids, now) => confirmExchange(db, ids, now),
    lastActivity: () => readSportsActivity(db),
  },
  ...(appUrl && cronSecret ? { triggerSettle } : {}),
  wsBooks: socket?.books,
  wantTokens: (tokens) => socket?.want(tokens),
  bookMode,
  emit: (level, ev, fields) => out(level, ev, fields),
}

const state = newWorkerState()
let stopping = false
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true
    out("info", "live.stopping", { signal: sig })
  })
}

/**
 * Sleeps in 1s slices so SIGTERM is honoured within a second even during a 15 minute idle sleep. A long sleep also polls the watch
 * signal every WATCH_POLL_MS and returns early when someone opens sports. Returns true when it was woken that way.
 */
async function sleep(ms: number): Promise<boolean> {
  const end = Date.now() + ms
  let nextPoll = Date.now() + WATCH_POLL_MS
  while (!stopping && Date.now() < end) {
    await new Promise((r) => setTimeout(r, Math.min(1_000, end - Date.now())))
    if (watch && Date.now() >= nextPoll && end - Date.now() > 5_000) {
      nextPoll = Date.now() + WATCH_POLL_MS
      if (await watch.changed()) return true
    }
  }
  return false
}
let failures = 0
let lastPrune = 0
let writtenSincePrune = 0
let lastReport = 0
let lastLock = 0
let nextQuietWatchPoll = 0

out("info", "live.start", { ws: useWs, once, bookMode, maxSleepMin: MAX_SLEEP_MS / 60_000 })
while (!stopping) {
  const started = Date.now()
  const now = new Date()
  quiet = quietNow(started)
  // A viewer arriving ends quiet mode at once (a request to the app, no database).
  if (quiet && watch && started >= nextQuietWatchPoll) {
    nextQuietWatchPoll = started + WATCH_POLL_MS
    if (await watch.changed()) { quiet = false; cached = null; out("info", "live.woken", { reason: "viewer", from: "quiet" }) }
  }
  if (cached) modeCycles[quiet ? "quiet" : cached.watched ? "watched" : "unwatchedLoaded"]++
  if (Date.now() - lastModeLog >= 10 * 60_000) {
    // Why the database was (or was not) kept busy: cycles with a viewer, cycles on an open pick only, and cycles run in memory.
    out("info", "live.mode", { ...modeCycles, sinceMin: Math.round((Date.now() - lastModeLog) / 60_000) })
    modeCycles.watched = modeCycles.unwatchedLoaded = modeCycles.quiet = 0
    lastModeLog = Date.now()
  }
  let result: TickResult | null = null
  let threw = false
  try {
    result = await runTick(deps, state, now)
  } catch (error) {
    threw = true
    state.stats.errors++
    // drizzle wraps the driver error ("Failed query: ..."); the Postgres message and code are on `cause`.
    const cause = (error as { cause?: { message?: string; code?: string } } | null)?.cause
    out("error", "live.cycle_failed", { error: clip(error), cause: cause ? clip(`${cause.code ?? ""} ${cause.message ?? ""}`) : undefined })
  }
  const slate = result?.slate ?? 0
  const failed = cycleFailed({ threw, slate, okCalls: result?.okCalls ?? 0, failCalls: result?.failCalls ?? 0, skippedBackoff: result?.skippedBackoff ?? 0 })
  failures = failed ? failures + 1 : 0
  if (!quiet) writtenSincePrune += result?.rowsWritten ?? 0
  // (repricing writes line versions, not live_quote rows, so it does not count towards pruning)

  // Pregame repricing: due every 30s while a game starts within 3 hours, once per shared quarter-hour slot otherwise. A failure here never
  // fails the live cycle (display) and never leaves a market half-repriced (each write is one transaction).
  let repriceNext = Number.POSITIVE_INFINITY
  let repriced: PassResult | null = null
  if (!threw && !quiet) {
    try {
      repriced = await runRepricePass(deps, state, new Date())
      if (repriced) repriceNext = repriced.targets === 0 ? Number.POSITIVE_INFINITY : repriced.nextPassMs
    } catch (error) {
      out("error", "live.reprice_failed", { error: clip(error) })
    }
  }

  // Kickoff locks. The publish and settle routes lock due markets too, but only hourly in quiet hours (live/slots.ts), and in-play
  // picks need a market locked at kickoff. While a game is on the slate the database is awake anyway: lock at most once a minute.
  if (slate > 0 && !quiet && Date.now() - lastLock >= 60_000) {
    lastLock = Date.now()
    try {
      const locked = await lockDueMarkets(db, new Date())
      if (locked) out("info", "live.locked", { locked })
      for (const g of cached?.rows ?? []) if (g.startsAt.getTime() <= Date.now()) kickoffLocked.add(g.id)
    } catch (error) {
      out("warn", "live.lock_failed", { error: clip(error) })
    }
  }

  // Idle: nothing live. Decide how long to sleep from the next scheduled start (one cheap query) and the next reprice pass.
  let delay = pollDelay(slate)
  if (!threw && slate === 0) {
    // Hourly sleeps (quiet hours only) need every tracked game to start beyond the repricing window plus an hour: the publish
    // guard trusts the announced wake time (sleepUntil) only while nothing it guards is that close.
    let hourly = false
    try {
      const now = new Date()
      const next = await nextStartAfter(db, now)
      // Hourly only when no tracked game starts soon, watched or not (#328 narrowed nextStartAfter to watched or picked games).
      const tracked = inQuietHours(now.getTime()) ? await nextTrackedStartAfter(db, now) : next
      hourly = !tracked || tracked.getTime() - now.getTime() > REPRICE.windowMs + QUIET_SLOT_MS
      delay = idleSleepMs(now, next, hourly && inQuietHours(now.getTime()) ? QUIET_SLOT_MS : MAX_SLEEP_MS)
    } catch (error) {
      out("warn", "live.next_start_failed", { error: clip(error) })
    }
    delay = Math.min(delay, Math.max(10_000, repriceNext))
    // A long sleep wakes on the shared slot, so this worker's database reads share an awake period with the cron routes.
    if (delay >= 5 * 60_000) delay = Math.min(delay, msToNextSlot(Date.now(), hourly))
  }

  // Prune only if something was written since the last prune: an idle worker must not wake the database for nothing.
  if (!quiet && writtenSincePrune > 0 && Date.now() - lastPrune > 15 * 60_000) {
    lastPrune = Date.now()
    try {
      const pruned = await pruneLiveQuotes(db, new Date())
      writtenSincePrune = 0
      out("info", "live.prune", { pruned })
    } catch (error) {
      out("warn", "live.prune_failed", { error: clip(error) })
    }
  }

  // Heartbeat for /api/sports/live/health (one tiny upsert per cycle). While quiet the previous one already announced the wake time.
  const goingQuiet = !quiet && quietNow(Date.now())
  const quietUntil = cached ? quietRefreshAt(cached.at) : 0
  if (!quiet) try {
    await writeHeartbeat(db, {
      name: WORKER_NAME,
      at: new Date(),
      ok: !failed,
      consecutiveFailures: failures,
      details: {
        slate,
        matched: result?.matched ?? 0,
        unmatched: (result?.unmatched ?? []).slice(0, 20),
        sources: result?.sources ?? {},
        reprice: repriced ? { targets: repriced.targets, matched: repriced.matched, updated: repriced.updated, frozen: repriced.frozen, held: repriced.held, skipped: repriced.skipped } : null,
        sleepUntil: new Date(goingQuiet ? quietUntil : Date.now() + delay).toISOString(),
        ...(goingQuiet ? { quiet: true } : {}),
        bookMode,
        ...(threw ? { lastError: "cycle threw (see logs)" } : {}),
      },
    })
  } catch (error) {
    out("warn", "live.heartbeat_failed", { error: clip(error) })
  }

  if (Date.now() - lastReport > 60_000 && slate > 0) {
    lastReport = Date.now()
    out("info", "live.report", { calls: state.stats.calls, rows: state.stats.rowsWritten, stateWrites: state.stats.stateWrites, errors: state.stats.errors, failures })
  }
  if (shouldExit(failures)) {
    out("error", "live.fatal", { reason: `${EXIT_AFTER_FAILURES} consecutive total failures`, exiting: true })
    socket?.close()
    await sql.end({ timeout: 2 }).catch(() => {})
    process.exit(1)
  }
  if (once) {
    socket?.close()
    await sql.end({ timeout: 5 })
    process.exit(failed ? 1 : 0)
  }
  if (await sleep(Math.max(1_000, delay - (Date.now() - started)))) {
    // A viewer arrived: the next cycle reads their activity stamp (live slate, live/store.ts) and runs a reprice pass straight away
    // instead of waiting for the slot it was sleeping towards.
    state.reprice.nextListAt = 0
    out("info", "live.woken", { reason: "viewer" })
  }
}

socket?.close()
await sql.end({ timeout: 5 })
out("info", "live.stopped")
