/**
 * Live odds ingest worker. A standalone, persistent process (Fly.io, Railway, a VPS; NOT a Vercel function).
 *
 * Every ~10s it asks the database which games are on the field right now, polls the public Polymarket REST
 * endpoints for just those games (Gamma list for score/period/clock, one batched CLOB /books call for the
 * order books; Kalshi and ESPN as cross-check/fallback every 30s) and writes `live_quote` / `live_state`.
 * Users only ever read those tables through /api/sports/live/[gameId], so upstream calls scale with the number
 * of live games, never with viewers. With no live game it sleeps 30s and makes no upstream call.
 *
 * DISPLAY ONLY. It never touches picks, lines, markets, the ledger or settlement; those keep using the
 * independent results feeds.
 *
 *   DATABASE_URL=postgres://... node --experimental-strip-types scripts/live-odds-worker.mts [--ws] [--once]
 *
 *   --ws     also stream Polymarket's market WebSocket and prefer its books when younger than 5s (REST remains the fallback)
 *   --once   run a single cycle and exit (smoke test / cron-style use)
 *
 * Env: DATABASE_URL (required), LIVE_ODDS_WS=1 (same as --ws), LIVE_ODDS_ENABLED=0 (idle kill switch).
 * Opens its own small connection pool; safe to run as exactly one replica (two replicas would only duplicate rows).
 */
import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { pollDelay } from "../src/lib/sports/live/plan.ts"
import { insertQuotes, loadLiveSlate, pruneLiveQuotes, upsertState } from "../src/lib/sports/live/store.ts"
import { MarketSocket } from "../src/lib/sports/live/ws.ts"
import { newWorkerState, runTick, type WorkerDeps } from "../src/lib/sports/live/worker.ts"

config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}
const once = process.argv.includes("--once")
const useWs = process.argv.includes("--ws") || process.env.LIVE_ODDS_WS === "1"
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`)

const sql = postgres(url, { max: 2, prepare: false })
const db = drizzle(sql, { schema })
const socket = useWs ? new MarketSocket(log) : null

const UA = { "user-agent": "peerfolio-live-odds/0.1", accept: "application/json" }
async function request(input: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(input, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(8_000) })
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
  wsBooks: socket?.books,
  wantTokens: (tokens) => socket?.want(tokens),
  log,
}

const state = newWorkerState()
let stopping = false
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true
    log(`${sig}: finishing the current cycle`)
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let lastPrune = 0
let lastReport = 0

log(`live-odds-worker starting (ws=${useWs}, once=${once})`)
while (!stopping) {
  const started = Date.now()
  let slate = 0
  if (process.env.LIVE_ODDS_ENABLED === "0") {
    slate = 0
  } else {
    try {
      slate = (await runTick(deps, state, new Date())).slate
    } catch (error) {
      state.stats.errors++
      log(`cycle failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (Date.now() - lastPrune > 5 * 60_000) {
      lastPrune = Date.now()
      try {
        const n = await pruneLiveQuotes(db, new Date())
        if (n) log(`pruned ${n} live_quote rows`)
      } catch (error) {
        log(`prune failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  if (Date.now() - lastReport > 60_000) {
    lastReport = Date.now()
    log(`slate=${slate} calls=${state.stats.calls} rows=${state.stats.rowsWritten} stateWrites=${state.stats.stateWrites} errors=${state.stats.errors}`)
  }
  if (once) break
  await sleep(Math.max(1_000, pollDelay(slate) - (Date.now() - started)))
}

socket?.close()
await sql.end({ timeout: 5 })
log("stopped")
