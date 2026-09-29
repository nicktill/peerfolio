import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { PgDialect } from "drizzle-orm/pg-core"
import { claimLiveQuotesSql, staleHeldSecurities } from "./stale-prices.ts"

describe("staleHeldSecurities", () => {
  const cutoff = new Date("2026-09-29T11:16:38.000Z")
  const clause = staleHeldSecurities(cutoff)

  it("builds a clause", () => {
    assert.ok(clause)
  })

  it("never sends a raw Date to the driver (that failed the first production refresh)", () => {
    const { sql, params } = new PgDialect().sqlToQuery(clause!)
    assert.ok(params.length > 0)
    for (const param of params) assert.equal(param instanceof Date, false, `raw Date param in: ${sql}`)
  })

  it("compares against the cutoff and restricts to held securities with a market ticker", () => {
    const { sql, params } = new PgDialect().sqlToQuery(clause!)
    assert.match(sql, /"market_ticker" is not null/)
    assert.match(sql, /"updated_at" </)
    assert.match(sql, /holdings/)
    assert.match(sql, /fantasy_positions/)
    assert.ok(params.some((p) => typeof p === "string" && p.startsWith("2026-09-29T11:16:38")))
  })
})

describe("claimLiveQuotesSql", () => {
  const { sql, params } = new PgDialect().sqlToQuery(claimLiveQuotesSql(60, 40))

  it("only ever sends plain numbers, never a Date", () => {
    assert.deepEqual(params, [60, 40])
  })

  it("claims atomically, oldest first, skipping rows another server holds", () => {
    assert.match(sql, /update securities/i)
    assert.match(sql, /set updated_at = now\(\)/i)
    assert.match(sql, /order by s\.updated_at asc/i)
    assert.match(sql, /for update skip locked/i)
    assert.match(sql, /returning id, market_ticker, close_price_as_of::text as close_price_as_of/i)
  })

  it("leaves out crypto and tickers nobody holds", () => {
    assert.match(sql, /market_ticker not like 'X:%'/i)
    assert.match(sql, /holdings/)
    assert.match(sql, /fantasy_positions/)
  })
})
