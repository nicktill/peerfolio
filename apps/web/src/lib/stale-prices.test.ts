import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { PgDialect } from "drizzle-orm/pg-core"
import { staleHeldSecurities } from "./stale-prices.ts"

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
