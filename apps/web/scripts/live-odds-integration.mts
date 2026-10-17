/**
 * Integration check of the live odds tables against a DISPOSABLE Postgres (migrations applied):
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:PORT/db node --experimental-strip-types scripts/live-odds-integration.mts
 *
 * Runs the real worker cycle (fake network, real store), reads the served view, checks freshness handling and
 * that the retention SQL keeps exactly what the reference policy says. Refuses to run against a non-local host.
 */
import assert from "node:assert/strict"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { retentionCutoffs, survivors } from "../src/lib/sports/live/retention.ts"
import { insertQuotes, loadLiveSlate, pruneLiveQuotes, readLiveView, upsertState } from "../src/lib/sports/live/store.ts"
import { newWorkerState, runTick } from "../src/lib/sports/live/worker.ts"

const url = process.env.DATABASE_URL ?? ""
if (!/@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) throw new Error("refusing to run against a non-local database")
const sql = postgres(url, { max: 2, prepare: false })
const db = drizzle(sql, { schema })

const now = new Date()
const [ev] = await db
  .insert(schema.sportsEvents)
  .values({ sport: "nba", externalId: `it-${now.getTime()}`, homeName: "Boston Celtics", awayName: "Detroit Pistons", startsAt: new Date(now.getTime() - 3600_000) })
  .returning()
assert.ok(ev)

const gamma = [
  {
    slug: "nba-det-bos",
    live: true,
    ended: false,
    score: "50-54",
    period: "Q2",
    elapsed: "05:12",
    startTime: new Date(now.getTime() - 3600_000).toISOString(),
    markets: [{ sportsMarketType: "moneyline", outcomes: '["Pistons","Celtics"]', clobTokenIds: '["t-det","t-bos"]', acceptingOrders: true }],
  },
]
const deps = {
  store: { loadSlate: (n: Date) => loadLiveSlate(db, n), insertQuotes: (r: Parameters<typeof insertQuotes>[1]) => insertQuotes(db, r), upsertState: (id: string, s: Parameters<typeof upsertState>[2]) => upsertState(db, id, s) },
  getJson: async (u: string) => (u.includes("gamma-api") ? gamma : { events: [] }),
  postJson: async (_u: string, body: unknown) =>
    (body as { token_id: string }[]).map(({ token_id }) => {
      const mid = token_id === "t-bos" ? 0.61 : 0.39
      return { asset_id: token_id, timestamp: String(Date.now() - 400), bids: [{ price: String(mid - 0.01) }], asks: [{ price: String(mid + 0.01) }] }
    }),
}

const st = newWorkerState()
const { slate } = await runTick(deps, st, new Date())
assert.ok(slate >= 1, "event is on the live slate")
let view = await readLiveView(db, ev.id, new Date())
assert.ok(view)
assert.equal(view.status, "live")
assert.deepEqual(view.score, { home: 54, away: 50 })
assert.equal(view.odds.status, "ok")
if (view.odds.status === "ok") {
  assert.ok(Math.abs(view.odds.homeProb - 0.61) < 1e-9, `home prob ${view.odds.homeProb}`)
  assert.equal(view.odds.freshness, "live")
}
console.log("view ok:", JSON.stringify(view.odds).slice(0, 120))

// Time passes with no new data: the same rows read two minutes later must pause the odds, not keep showing them.
view = await readLiveView(db, ev.id, new Date(Date.now() + 3 * 60_000))
assert.equal(view?.odds.status, "paused")
console.log("stale read pauses odds:", view?.odds.status === "paused" && view.odds.reason)

// Retention: seed old rows, prune, compare with the reference policy.
const base = Date.now()
const old = [0, 1, 2, 3, 4, 5].map((i) => ({ eventId: ev.id, market: "moneyline", selection: "home", source: "kalshi", bid: 0.4 + i / 100, ask: 0.42 + i / 100, mid: 0.41 + i / 100, sourceTs: null, fetchedTs: new Date(base - (40 + i) * 60_000) }))
const ancient = { ...old[0]!, source: "espn", fetchedTs: new Date(base - 4 * 24 * 3600_000) }
const ancient2 = { ...ancient, fetchedTs: new Date(base - 5 * 24 * 3600_000) }
await insertQuotes(db, [...old, ancient, ancient2])
const all = await sql<{ id: number; source: string; fetched_ts: Date }[]>`SELECT id, source, fetched_ts FROM live_quote WHERE event_id = ${ev.id}`
const expect = survivors(all.map((r) => ({ id: r.id, key: `${r.source}`, at: new Date(r.fetched_ts) })), new Date(base))
const deleted = await pruneLiveQuotes(db, new Date(base))
const left = await sql<{ id: number }[]>`SELECT id FROM live_quote WHERE event_id = ${ev.id}`
assert.deepEqual(new Set(left.map((r) => r.id)), expect, "SQL retention matches the reference policy")
assert.ok(deleted >= all.length - expect.size)
console.log(`retention ok: ${all.length} rows -> ${left.length} (cutoffs ${JSON.stringify(retentionCutoffs(new Date(base)).bucketSeconds)}s buckets)`)
// Latest per key survives even when old.
const espn = await sql`SELECT 1 FROM live_quote WHERE event_id = ${ev.id} AND source = 'espn'`
assert.equal(espn.length, 1)

// Cascade: nothing in picks/lines/markets/ledger was touched.
const [counts] = await sql<{ n: number }[]>`SELECT (SELECT count(*) FROM sports_picks) + (SELECT count(*) FROM sports_lines) + (SELECT count(*) FROM sports_ledger) AS n`
assert.equal(Number(counts!.n), 0)

await db.delete(schema.sportsEvents).where(eq(schema.sportsEvents.id, ev.id))
await sql.end()
console.log("live odds integration: PASS")
