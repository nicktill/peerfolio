import assert from "node:assert/strict"
import { after, before, beforeEach, describe, it } from "node:test"
import { PgDialect } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import postgres from "postgres"
import { leagueSportsSql, trackedEventSql } from "./ingestion-scope.ts"

const url = process.env.PEERFOLIO_TEST_PG_URL
const schema = `sports_scope_${process.pid}`
const now = new Date("2026-10-22T18:00:00Z")
const dialect = new PgDialect()

describe("sports ingestion scope against Postgres", { skip: url ? false : "PEERFOLIO_TEST_PG_URL is not set" }, () => {
  let db: ReturnType<typeof postgres>
  before(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} })
    await admin.unsafe(`CREATE SCHEMA ${schema}`)
    await admin.end()
    db = postgres(url!, { max: 1, onnotice: () => {}, connection: { search_path: schema } })
    await db.unsafe(`
      CREATE TABLE sports_leagues (id text PRIMARY KEY, sports jsonb, ends_at timestamptz);
      CREATE TABLE sports_members (id text PRIMARY KEY, league_id text);
      CREATE TABLE sports_events (id text PRIMARY KEY, sport text);
      CREATE TABLE sports_markets (id text PRIMARY KEY, event_id text);
      CREATE TABLE sports_picks (id text PRIMARY KEY, market_id text, status text);
      CREATE TABLE sports_parlays (id text PRIMARY KEY, status text);
      CREATE TABLE sports_parlay_legs (parlay_id text, event_id text, status text)`)
  })
  after(async () => {
    if (!db) return
    await db.unsafe(`DROP SCHEMA ${schema} CASCADE`)
    await db.end()
  })
  beforeEach(async () => {
    await db.unsafe("TRUNCATE sports_leagues, sports_members, sports_events, sports_markets, sports_picks, sports_parlays, sports_parlay_legs")
    await db.unsafe("INSERT INTO sports_events VALUES ('basketball','nba'), ('football','nfl'), ('soccer','epl')")
    await db.unsafe("INSERT INTO sports_markets VALUES ('nba-market','basketball'), ('nfl-market','football')")
  })
  async function run(fragment: ReturnType<typeof sql>) {
    const q = dialect.sqlToQuery(fragment)
    return db.unsafe(q.sql, q.params as never[])
  }
  const events = async () => (await run(sql`SELECT id FROM sports_events WHERE ${trackedEventSql(now)} ORDER BY id`)).map((r) => r.id)
  const sports = async () => (await run(leagueSportsSql(now))).map((r) => r.sport).sort()
  async function league(id: string, selected: string[], endsAt: string | null = null, member = true) {
    await db.unsafe("INSERT INTO sports_leagues VALUES ($1,$2::text::jsonb,$3)", [id, JSON.stringify(selected), endsAt])
    if (member) await db.unsafe("INSERT INTO sports_members VALUES ($1,$1)", [id])
  }
  it("does no ingestion with no leagues or pending picks", async () => {
    assert.deepEqual(await sports(), [])
    assert.deepEqual(await events(), [])
  })
  it("tracks the union of active league sports once, not unrelated published games", async () => {
    await league("one", ["nba"])
    await league("two", ["nba", "nfl"], "2026-10-23T00:00:00Z")
    assert.deepEqual(await sports(), ["nba", "nfl"])
    assert.deepEqual(await events(), ["basketball", "football"])
  })
  it("ignores expired and empty leagues, including the exact expiry instant", async () => {
    await league("expired", ["nba"], now.toISOString())
    await league("empty", ["nfl"], null, false)
    assert.deepEqual(await events(), [])
    assert.deepEqual(await sports(), [])
  })
  it("keeps open singles even when no league currently offers the sport", async () => {
    await db.unsafe("INSERT INTO sports_picks VALUES ('open','nba-market','open'), ('done','nfl-market','won')")
    assert.deepEqual(await events(), ["basketball"])
    assert.deepEqual(await sports(), [], "obligations do not cause new markets to be published")
    await db.unsafe("UPDATE sports_picks SET status='cashed_out' WHERE id='open'")
    assert.deepEqual(await events(), [])
  })
  it("keeps only open legs on open parlays, including after league expiry", async () => {
    await league("expired", ["nba"], now.toISOString())
    await db.unsafe("INSERT INTO sports_parlays VALUES ('pending','open'), ('closed','cashed_out')")
    await db.unsafe("INSERT INTO sports_parlay_legs VALUES ('pending','basketball','open'), ('pending','football','won'), ('closed','soccer','open')")
    assert.deepEqual(await events(), ["basketball"])
    await db.unsafe("UPDATE sports_parlays SET status='won' WHERE id='pending'")
    assert.deepEqual(await events(), [])
  })
  it("new league settings take effect on the next query without a persistent stale scope", async () => {
    await league("one", ["nba"])
    assert.deepEqual(await events(), ["basketball"])
    await db.unsafe(`UPDATE sports_leagues SET sports='["epl"]'::jsonb WHERE id='one'`)
    assert.deepEqual(await events(), ["soccer"])
  })
})
