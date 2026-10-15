/**
 * Runs the close-catch-up SQL against a real Postgres. Skipped unless PEERFOLIO_TEST_PG_URL is
 * set (a throwaway database: the test creates and drops its own schema, nothing else is touched).
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { PgDialect } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import postgres from "postgres"
import { captureSession, isUsMarketOpen } from "./market-hours.ts"
import { closeClaimDue, closeRecheckMinutes, fundNavMayBePublished, staleHeldSecurities, unsettledHeldSql } from "./stale-prices.ts"

const url = process.env.PEERFOLIO_TEST_PG_URL
const schema = `close_refresh_${process.pid}`
const dialect = new PgDialect()

describe("close catch-up against Postgres", { skip: url ? false : "PEERFOLIO_TEST_PG_URL is not set" }, () => {
  let db: ReturnType<typeof postgres>

  before(async () => {
    const admin = postgres(url!, { max: 1, onnotice: () => {} })
    await admin.unsafe(`CREATE SCHEMA ${schema}`)
    await admin.end()
    db = postgres(url!, { max: 1, onnotice: () => {}, connection: { search_path: schema } })
    await db.unsafe(`
      CREATE TABLE securities (
        id text PRIMARY KEY, market_ticker text, type text,
        updated_at timestamptz NOT NULL DEFAULT now(),
        close_price_as_of date, close_price_final boolean NOT NULL DEFAULT false);
      CREATE TABLE holdings (id serial PRIMARY KEY, security_id text);
      CREATE TABLE fantasy_positions (id serial PRIMARY KEY, security_id text)`)
  })

  after(async () => {
    if (!db) return
    await db.unsafe(`DROP SCHEMA ${schema} CASCADE`)
    await db.end()
  })

  type Row = { asOf: string | null; final?: boolean; updated: string; type?: string; fantasy?: boolean }
  const seed = async (rows: Record<string, Row>) => {
    await db.unsafe("TRUNCATE securities, holdings, fantasy_positions")
    for (const [ticker, r] of Object.entries(rows)) {
      await db.unsafe("INSERT INTO securities (id, market_ticker, type, updated_at, close_price_as_of, close_price_final) VALUES ($1, $1, $2, $3, $4, $5)", [ticker, r.type ?? "equity", r.updated, r.asOf, r.final ?? false])
      await db.unsafe(`INSERT INTO ${r.fantasy ? "fantasy_positions" : "holdings"} (security_id) VALUES ($1)`, [ticker])
    }
  }

  /** What `refreshStalePrices` derives from `now` (recheckMinutes 10, maxAge 6 h), then runs both queries. */
  const run = async (nowIso: string) => {
    const now = new Date(nowIso)
    const marketOpen = isUsMarketOpen(now)
    const expectedDate = captureSession(now)
    const neverPricedRecheckBefore = new Date(now.getTime() - 10 * 60_000)
    const recheckBefore = new Date(now.getTime() - closeRecheckMinutes(now, expectedDate, { marketOpen, earlyMinutes: 10 }) * 60_000)
    const fundNavOpen = fundNavMayBePublished(now, expectedDate)
    const catchUp = { expectedDate, recheckBefore, neverPricedRecheckBefore, marketClosed: !marketOpen, fundNavOpen }
    const select = dialect.sqlToQuery(sql`SELECT id FROM securities WHERE ${staleHeldSecurities(new Date(now.getTime() - 6 * 3_600_000), catchUp)} ORDER BY id`)
    const selected = (await db.unsafe(select.sql, select.params as never[])).map((r) => r.id as string)
    const count = dialect.sqlToQuery(unsettledHeldSql(expectedDate, { recheckBefore, neverPricedRecheckBefore, fundNavOpen }))
    const [pending] = await db.unsafe(count.sql, count.params as never[])
    return { expectedDate, selected, n: Number(pending.n), due: Number(pending.due) }
  }

  it("normal close: a settled ticker is not selected, an unsettled one is", async () => {
    await seed({
      SETTLED: { asOf: "2026-10-14", final: true, updated: "2026-10-14T20:45:00Z" },
      BEHIND: { asOf: "2026-10-13", final: true, updated: "2026-10-14T15:00:00Z" },
      LIVEONLY: { asOf: "2026-10-14", final: false, updated: "2026-10-14T15:00:00Z", fantasy: true },
    })
    const r = await run("2026-10-14T21:00:00Z") // 17:00 EDT
    assert.equal(r.expectedDate, "2026-10-14")
    assert.deepEqual(r.selected, ["BEHIND", "LIVEONLY"])
    assert.equal(r.n, 2)
  })

  it("holiday: nothing is expected for a day the market never traded", async () => {
    await seed({ SETTLED: { asOf: "2026-09-04", final: true, updated: "2026-09-04T21:00:00Z" } })
    const r = await run("2026-09-07T22:00:00Z") // Labor Day, 18:00 EDT
    assert.equal(r.expectedDate, "2026-09-04")
    assert.deepEqual(r.selected, [])
    assert.equal(r.n, 0)
  })

  it("early close: the catch-up starts at 13:30 and targets that same day", async () => {
    await seed({
      SETTLED: { asOf: "2026-11-27", final: true, updated: "2026-11-27T18:40:00Z" },
      BEHIND: { asOf: "2026-11-25", final: true, updated: "2026-11-27T12:00:00Z" },
    })
    const before1330 = await run("2026-11-27T18:25:00Z") // 13:25 EST
    assert.equal(before1330.expectedDate, "2026-11-25")
    assert.deepEqual(before1330.selected, [])
    const after1330 = await run("2026-11-27T18:45:00Z") // 13:45 EST
    assert.equal(after1330.expectedDate, "2026-11-27")
    assert.deepEqual(after1330.selected, ["BEHIND"])
  })

  it("a never-priced ticker is selected quickly, even overnight when everything else backs off", async () => {
    await seed({
      NEW: { asOf: null, updated: "2026-10-15T07:45:00Z" }, // checked 15 min ago
      OTC: { asOf: "2026-10-10", final: true, updated: "2026-10-15T07:45:00Z" }, // same, but has an old price
    })
    const r = await run("2026-10-15T08:00:00Z") // 04:00 EDT, 360 min spacing
    assert.deepEqual(r.selected, ["NEW"])
    assert.equal(r.due, 1)
    // During the live session the short interval holds for both.
    await seed({ NEW: { asOf: null, updated: "2026-10-14T14:45:00Z" }, BEHIND: { asOf: "2026-10-12", final: true, updated: "2026-10-14T14:45:00Z" } })
    assert.deepEqual((await run("2026-10-14T15:00:00Z")).selected, ["BEHIND", "NEW"])
  })

  it("claims never-priced rows on the short cutoff and excludes a second claimant", async () => {
    await seed({ NEW: { asOf: null, updated: "2026-10-14T22:45:00Z" }, OLD: { asOf: "2026-10-13", updated: "2026-10-14T22:45:00Z" } })
    assert.deepEqual((await run("2026-10-14T23:00:00Z")).selected, ["NEW"])
    const due = closeClaimDue({ recheckBefore: new Date("2026-10-14T21:00:00Z"), neverPricedRecheckBefore: new Date("2026-10-14T22:50:00Z") })
    const claim = dialect.sqlToQuery(sql`UPDATE securities SET updated_at = '2026-10-14T23:00:00Z' WHERE id IN ('NEW', 'OLD') AND ${due} RETURNING id`)
    assert.deepEqual((await db.unsafe(claim.sql, claim.params as never[])).map(r => r.id), ["NEW"])
    assert.deepEqual(await db.unsafe(claim.sql, claim.params as never[]).then(rows => [...rows]), [])
  })

  it("a fund is held back before 19:00 ET and selected after", async () => {
    await seed({ FUND: { asOf: "2026-10-13", final: true, updated: "2026-10-14T15:00:00Z", type: "mutual_fund" } })
    const early = await run("2026-10-14T22:30:00Z") // 18:30 EDT
    assert.deepEqual(early.selected, [])
    assert.equal(early.n, 1)
    assert.equal(early.due, 0)
    const late = await run("2026-10-14T23:30:00Z") // 19:30 EDT
    assert.deepEqual(late.selected, ["FUND"])
    assert.equal(late.due, 1)
  })

  it("an unsettleable OTC name is due only once its cooldown has passed", async () => {
    const stale = { asOf: "2026-10-10", final: true }
    await seed({ OTC: { ...stale, updated: "2026-10-15T06:00:00Z" } }) // checked 2 h ago, 6 h spacing
    const cooling = await run("2026-10-15T08:00:00Z")
    assert.equal(cooling.n, 1)
    assert.equal(cooling.due, 0)
    assert.deepEqual(cooling.selected, [])
    await seed({ OTC: { ...stale, updated: "2026-10-15T01:00:00Z" } }) // 7 h ago: cooldown open
    const open = await run("2026-10-15T08:00:00Z")
    assert.equal(open.due, 1)
    assert.deepEqual(open.selected, ["OTC"])
  })
})
