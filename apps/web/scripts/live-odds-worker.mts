/**
 * Live odds ingest worker. A standalone, persistent process (Fly.io, Railway, a VPS; NOT a Vercel function).
 *
 * While a game is on the field it polls every 10s: the public Polymarket REST endpoints for just those games (Gamma list
 * for score/period/clock, one batched CLOB /books call for the order books; Kalshi and ESPN as cross-check/fallback every
 * 30s) and writes `live_quote` / `live_state`. Users only ever read those tables through /api/sports/live/[gameId], so
 * upstream calls scale with the number of live games, never with viewers.
 *
 * With nothing live it SLEEPS until 10 minutes before the next scheduled start (at most 15 minutes) and touches the
 * database only once per wake-up, so a serverless Postgres (Neon) can suspend between games.
 *
 * DISPLAY ONLY. It never touches picks, lines, markets, the ledger or settlement; those keep using the independent
 * results feeds.
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
import { idleSleepMs, MAX_SLEEP_MS, pollDelay } from "../src/lib/sports/live/plan.ts"
import { insertQuotes, loadLiveSlate, nextStartAfter, pruneLiveQuotes, upsertState, writeHeartbeat } from "../src/lib/sports/live/store.ts"
import { applyReprice, confirmExchange, freezeForReason, listRepriceTargets, reopenWorkerFrozen } from "../src/lib/sports/store.ts"
import { runRepricePass } from "../src/lib/sports/live/reprice-pass.ts"
import { MarketSocket } from "../src/lib/sports/live/ws.ts"
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

const deps: WorkerDeps = {
  store: {
    loadSlate: (now) => loadLiveSlate(db, now),
    insertQuotes: (rows) => insertQuotes(db, rows),
    upsertState: (eventId, state) => upsertState(db, eventId, state),
  },
  getJson: (u) => request(u),
  postJson: (u, body) => request(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  reprice: {
    listTargets: (now) => listRepriceTargets(db, now),
    apply: (marketId, basis, decision, now) => applyReprice(db, marketId, basis, decision, now),
    freeze: (marketId, reason) => freezeForReason(db, marketId, reason),
    reopen: (marketId, now) => reopenWorkerFrozen(db, marketId, now),
    confirm: (ids, now) => confirmExchange(db, ids, now),
  },
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

/** Sleeps in 1s slices so SIGTERM is honoured within a second even during a 15 minute idle sleep. */
async function sleep(ms: number) {
  const end = Date.now() + ms
  while (!stopping && Date.now() < end) await new Promise((r) => setTimeout(r, Math.min(1_000, end - Date.now())))
}
let failures = 0
let lastPrune = 0
let writtenSincePrune = 0
let lastReport = 0

out("info", "live.start", { ws: useWs, once, bookMode, maxSleepMin: MAX_SLEEP_MS / 60_000 })
while (!stopping) {
  const started = Date.now()
  const now = new Date()
  let result: TickResult | null = null
  let threw = false
  try {
    result = await runTick(deps, state, now)
  } catch (error) {
    threw = true
    state.stats.errors++
    out("error", "live.cycle_failed", { error: clip(error) })
  }
  const slate = result?.slate ?? 0
  const failed = cycleFailed({ threw, slate, okCalls: result?.okCalls ?? 0, failCalls: result?.failCalls ?? 0, skippedBackoff: result?.skippedBackoff ?? 0 })
  failures = failed ? failures + 1 : 0
  writtenSincePrune += result?.rowsWritten ?? 0
  // (repricing writes line versions, not live_quote rows, so it does not count towards pruning)

  // Pregame repricing: due every 60s while a game starts within 3 hours, every 15 minutes otherwise. A failure here never
  // fails the live cycle (display) and never leaves a market half-repriced (each write is one transaction).
  let repriceNext = Number.POSITIVE_INFINITY
  let repriced: PassResult | null = null
  if (!threw) {
    try {
      repriced = await runRepricePass(deps, state, new Date())
      if (repriced) repriceNext = repriced.targets === 0 ? Number.POSITIVE_INFINITY : repriced.nextPassMs
    } catch (error) {
      out("error", "live.reprice_failed", { error: clip(error) })
    }
  }

  // Idle: nothing live. Decide how long to sleep from the next scheduled start (one cheap query) and the next reprice pass.
  let delay = pollDelay(slate)
  if (!threw && slate === 0) {
    try {
      delay = idleSleepMs(new Date(), await nextStartAfter(db, new Date()))
    } catch (error) {
      out("warn", "live.next_start_failed", { error: clip(error) })
    }
    delay = Math.min(delay, Math.max(10_000, repriceNext))
  }

  // Prune only if something was written since the last prune: an idle worker must not wake the database for nothing.
  if (writtenSincePrune > 0 && Date.now() - lastPrune > 5 * 60_000) {
    lastPrune = Date.now()
    try {
      const pruned = await pruneLiveQuotes(db, new Date())
      writtenSincePrune = 0
      out("info", "live.prune", { pruned })
    } catch (error) {
      out("warn", "live.prune_failed", { error: clip(error) })
    }
  }

  // Heartbeat for /api/sports/live/health (one tiny upsert per cycle).
  try {
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
        sleepUntil: new Date(Date.now() + delay).toISOString(),
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
  await sleep(Math.max(1_000, delay - (Date.now() - started)))
}

socket?.close()
await sql.end({ timeout: 5 })
out("info", "live.stopped")
