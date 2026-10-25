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
import { createWorkerRunner } from "../src/lib/sports/live/runner.ts"
import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { EXIT_AFTER_FAILURES, WORKER_NAME } from "../src/lib/sports/live/health.ts"
import { clip, emit, type Fields, type Level } from "../src/lib/sports/log.ts"
import { MAX_SLEEP_MS } from "../src/lib/sports/live/plan.ts"
import { insertQuotes, loadLiveSlate, nextStartAfter, nextTrackedStartAfter, pruneLiveQuotes, readSportsActivity, upsertState, writeHeartbeat } from "../src/lib/sports/live/store.ts"
import { applyReprice, confirmExchange, freezeForReason, listRepriceTargets, lockDueMarkets, recoverFrozenMarket } from "../src/lib/sports/store.ts"
import { MarketSocket } from "../src/lib/sports/live/ws.ts"
import { WATCH_POLL_MS, WatchSignal } from "../src/lib/sports/live/watch-signal.ts"
import { type WorkerDeps } from "../src/lib/sports/live/worker.ts"

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

const deps: WorkerDeps = {
  store: {
    // Quiet mode (see quietNow): serve the slate loaded earlier and store nothing, so the database can suspend between refreshes.
    loadSlate: async (now) => {
      return loadLiveSlate(db, now)
    },
    insertQuotes: async (rows) => { await insertQuotes(db, rows) },
    upsertState: async (eventId, state) => { await upsertState(db, eventId, state) },
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

const runner = createWorkerRunner(deps, {
  lockDueMarkets: (now) => lockDueMarkets(db, now),
  nextStartAfter: (now) => nextStartAfter(db, now),
  nextTrackedStartAfter: (now) => nextTrackedStartAfter(db, now),
  pruneLiveQuotes: (now) => pruneLiveQuotes(db, now),
  writeHeartbeat: (input) => writeHeartbeat(db, input),
  ...(watch ? {watch} : {}),
})
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
out("info", "live.start", { ws: useWs, once, bookMode, maxSleepMin: MAX_SLEEP_MS / 60_000 })
while (!stopping) {
  const { failed, fatal, delayMs } = await runner.step()
  if (fatal) {
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
  if (await sleep(delayMs)) {
    // A viewer arrived: the next cycle reads their activity stamp (live slate, live/store.ts) and runs a reprice pass straight away
    // instead of waiting for the slot it was sleeping towards.
    runner.wake()
    out("info", "live.woken", { reason: "viewer" })
  }
}

socket?.close()
await sql.end({ timeout: 5 })
out("info", "live.stopped")
