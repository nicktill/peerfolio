/**
 * Integration check of the live odds tables against a DISPOSABLE Postgres (migrations applied):
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:PORT/db node --experimental-strip-types scripts/live-odds-integration.mts
 *
 * Runs the real worker cycle (fake network, real store), reads the served view, checks freshness handling and
 * that the retention SQL keeps exactly what the reference policy says. Refuses to run against a non-local host.
 */
import assert from "node:assert/strict"
import { eq, sql as querySql } from "drizzle-orm"
import { quoteHistory } from "../src/lib/sports/live/history.ts"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { retentionCutoffs, survivors } from "../src/lib/sports/live/retention.ts"
import { liveHealth, WORKER_NAME } from "../src/lib/sports/live/health.ts"
import { idleSleepMs } from "../src/lib/sports/live/plan.ts"
import { insertQuotes, loadLiveSlate, nextStartAfter, pruneLiveQuotes, readHealthInput, readLiveView, upsertState, writeHeartbeat } from "../src/lib/sports/live/store.ts"
import { newWorkerState, runTick } from "../src/lib/sports/live/worker.ts"

const url = process.env.DATABASE_URL ?? ""
if (!/@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) throw new Error("refusing to run against a non-local database")
const sql = postgres(url, { max: 2, prepare: false })
const db = drizzle(sql, { schema })

const now = new Date()
// Isolation: count the money tables first and assert this script changed none of them (other data may exist).
const money = async () => Number((await sql<{ n: number }[]>`SELECT (SELECT count(*) FROM sports_picks) + (SELECT count(*) FROM sports_lines) + (SELECT count(*) FROM sports_ledger) AS n`)[0]!.n)
const moneyBefore = await money()
// Remove rows left by an earlier aborted run of this script (its events are named it-*), so reruns start clean.
await sql`DELETE FROM sports_events WHERE external_id LIKE 'it-%'`
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

// The chart must reject an empty closing book instead of plotting its midpoint as a false 50% move.
const end = new Date(Date.now() + 1000)
await insertQuotes(db, (["home", "away"] as const).map(selection => ({ eventId: ev.id, market: "moneyline", selection, source: "polymarket", bid: 0, ask: 1, mid: 0.5, sourceTs: end, fetchedTs: end })))
const historyRows = await db.execute<import("../src/lib/sports/live/view.ts").QuoteRow>(querySql`
 SELECT market, selection, source, bid, ask, mid, source_ts AS "sourceTs", fetched_ts AS "fetchedTs"
 FROM live_quote WHERE event_id = ${ev.id} ORDER BY fetched_ts DESC, id DESC LIMIT 12000`)
const history = quoteHistory([...historyRows], "polymarket")
assert.ok(history.series.length > 0)
assert.ok(Math.abs(history.series.at(-1)!.v - 0.61) < 1e-9, "chart keeps last usable paired probability, not empty-book midpoint")
await sql`DELETE FROM live_quote WHERE event_id = ${ev.id} AND fetched_ts = ${end.toISOString()}::timestamptz`
console.log("chart history ignores empty closing books: PASS")


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

// Health: heartbeat + readHealthInput + classification against real rows.
await writeHeartbeat(db, { name: WORKER_NAME, at: new Date(), ok: true, consecutiveFailures: 0, details: { sleepUntil: new Date(Date.now() + 10_000).toISOString(), unmatched: [] } })
await writeHeartbeat(db, { name: WORKER_NAME, at: new Date(), ok: true, consecutiveFailures: 0, details: { sleepUntil: new Date(Date.now() + 10_000).toISOString(), unmatched: [] } }) // upsert twice
const hin = await readHealthInput(db, WORKER_NAME, new Date())
assert.ok(hin.worker)
assert.ok(hin.liveGames.some((g) => g.eventId === ev.id && g.newestQuoteAt), "live game has a newest quote time")
const hl = liveHealth(hin, new Date())
console.log("health:", hl.status, JSON.stringify(hl.reasons))
assert.ok(hl.games.find((g) => g.eventId === ev.id)?.quoteAgeMs != null)

// Idle scheduling: the next scheduled start drives the sleep. 90s out is earlier than any other event this or other
// scripts could have left, so the check does not depend on the database being empty.
const [future] = await db.insert(schema.sportsEvents).values({ sport: "nfl", externalId: `it-f-${Date.now()}`, homeName: "A", awayName: "B", startsAt: new Date(Date.now() + 90_000) }).returning()
const next = await nextStartAfter(db, new Date())
assert.ok(next && Math.abs(next.getTime() - future!.startsAt.getTime()) < 1000)
assert.equal(idleSleepMs(new Date(), next), 30_000)
console.log("idle sleep with a start in 90s: 30s poll")
await db.delete(schema.sportsEvents).where(eq(schema.sportsEvents.id, future!.id))

// Cascade: nothing in picks/lines/markets/ledger was touched.
assert.equal(await money(), moneyBefore, "picks, lines and ledger untouched")

await db.delete(schema.sportsEvents).where(eq(schema.sportsEvents.id, ev.id))
await sql.end()
console.log("live odds integration: PASS")
