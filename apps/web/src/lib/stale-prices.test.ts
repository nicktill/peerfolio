import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { latestTradingSession, isUsMarketOpen } from "./market-hours.ts"
import { PgDialect } from "drizzle-orm/pg-core"
import { canSkipCloseCheck, unsettledHeldSql, claimBudget, claimLiveQuotesSql, recentClaimsSql, releaseClaimsSql, staleHeldSecurities } from "./stale-prices.ts"

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

describe("staleHeldSecurities catch-up", () => {
  const clause = staleHeldSecurities(new Date("2026-09-29T11:00:00.000Z"), { expectedDate: "2026-09-29", recheckBefore: new Date("2026-09-30T00:40:00.000Z") })
  const { sql, params } = new PgDialect().sqlToQuery(clause!)

  it("also picks up prices dated before the latest finished session, once they haven't been checked recently", () => {
    assert.match(sql, /"close_price_as_of" is null or "securities"\."close_price_as_of" </i)
    assert.ok(params.includes("2026-09-29"))
    assert.match(sql, /"updated_at" </)
  })

  it("also picks up a live price from that same session, so the official close replaces it", () => {
    assert.match(sql, /"securities"\."close_price_as_of" = \$\d+ and "securities"\."close_price_final" = \$\d+/i)
    assert.ok(params.includes(false))
  })

  it("still never sends a raw Date", () => {
    for (const param of params) assert.equal(param instanceof Date, false)
  })
})

describe("claimBudget", () => {
  it("gives what's left of the per-minute budget, capped per run", () => {
    assert.equal(claimBudget({ recent: 0, perMinute: 40, maxPerRun: 25 }), 25)
    assert.equal(claimBudget({ recent: 30, perMinute: 40, maxPerRun: 25 }), 10)
  })

  it("is zero once the minute's budget is spent, never negative", () => {
    assert.equal(claimBudget({ recent: 40, perMinute: 40, maxPerRun: 25 }), 0)
    assert.equal(claimBudget({ recent: 55, perMinute: 40, maxPerRun: 25 }), 0)
  })

  it("drains a big backlog over several runs without ever exceeding the budget", () => {
    let due = 200
    let spentThisMinute = 0
    const runs: number[] = []
    for (let run = 0; run < 12 && due > 0; run++) {
      const take = Math.min(due, claimBudget({ recent: spentThisMinute, perMinute: 40, maxPerRun: 25 }))
      runs.push(take)
      due -= take
      spentThisMinute += take
      if (run % 2 === 1) spentThisMinute = 0 // the minute rolls over every second run
    }
    assert.ok(runs.every((n) => n <= 25))
    assert.ok(due === 0, `backlog left: ${due}, runs: ${runs}`)
  })
})

describe("recentClaimsSql and releaseClaimsSql", () => {
  it("count and release with plain numbers and ids only", () => {
    const recent = new PgDialect().sqlToQuery(recentClaimsSql(60))
    assert.deepEqual(recent.params, [60])
    const release = new PgDialect().sqlToQuery(releaseClaimsSql(["mkt:AAPL", "mkt:NVDA"], 120, 900))
    assert.deepEqual(release.params, [780, "mkt:AAPL", "mkt:NVDA"])
    assert.match(release.sql, /update securities/i)
    assert.match(release.sql, /set updated_at = now\(\) - make_interval/i)
  })

  it("makes a released ticker due again after the retry delay, not a full period", () => {
    // updated_at is set to (period - retry) seconds ago, so it is `retry` seconds from being older than the period.
    const { params } = new PgDialect().sqlToQuery(releaseClaimsSql(["x"], 120, 900))
    assert.equal(params[0], 900 - 120)
  })
})

describe("canSkipCloseCheck", () => {
  const decide = (iso: string, unsettled: number) => canSkipCloseCheck({ marketOpen: isUsMarketOpen(new Date(iso)), unsettled })

  it("skips on a weeknight when everything is settled", () => assert.equal(decide("2026-10-14T02:00:00Z", 0), true))
  it("skips all weekend", () => {
    assert.equal(decide("2026-10-17T15:00:00Z", 0), true)
    assert.equal(decide("2026-10-18T03:00:00Z", 0), true)
  })
  it("skips on a holiday", () => assert.equal(decide("2026-12-25T16:00:00Z", 0), true))
  it("skips after an early close", () => assert.equal(decide("2026-11-27T19:30:00Z", 0), true))
  it("does not skip while the market is open", () => assert.equal(decide("2026-10-14T15:00:00Z", 0), false))
  it("does not skip when a close is missing", () => assert.equal(decide("2026-10-14T02:00:00Z", 1), false))
  it("does not skip for a brand-new ticker without any price", () => assert.equal(decide("2026-10-17T15:00:00Z", 1), false))
})

describe("latestTradingSession", () => {
  it("steps back over weekends", () => assert.equal(latestTradingSession(new Date("2026-10-18T15:00:00Z")), "2026-10-16"))
  it("steps back over a Monday holiday", () => assert.equal(latestTradingSession(new Date("2026-09-07T23:00:00Z")), "2026-09-04"))
  it("uses today after the close", () => assert.equal(latestTradingSession(new Date("2026-10-14T21:00:00Z")), "2026-10-14"))
  it("uses the previous day before the close is published", () => assert.equal(latestTradingSession(new Date("2026-10-14T15:00:00Z")), "2026-10-13"))
})

describe("unsettledHeldSql", () => {
  it("counts only held, tickered securities and sends the date as a string", () => {
    const { sql, params } = new PgDialect().sqlToQuery(unsettledHeldSql("2026-10-13"))
    assert.match(sql, /close_price_as_of is null/i)
    assert.match(sql, /fantasy_positions/)
    assert.ok(params.every((p) => !(p instanceof Date)))
  })
})
