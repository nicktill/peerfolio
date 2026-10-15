import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { latestTradingSession, isUsMarketOpen } from "./market-hours.ts"
import { PgDialect } from "drizzle-orm/pg-core"
import { canSkipCloseCheck, catchUpRecheckMinutes, closeRecheckMinutes, liveRefreshBroken, fundNavMayBePublished, unsettledHeldSql, claimBudget, claimLiveQuotesSql, recentClaimsSql, releaseClaimsSql, staleHeldSecurities } from "./stale-prices.ts"

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
    assert.match(sql, /"close_price_as_of" is null and "securities"\."updated_at" < \$\d+/i)
    assert.match(sql, /"close_price_as_of" is not null and "securities"\."updated_at" < \$\d+/i)
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

describe("unsettledHeldSql due cutoffs", () => {
  const due = { recheckBefore: new Date("2026-10-14T22:00:00.000Z") }
  const { sql, params } = new PgDialect().sqlToQuery(unsettledHeldSql("2026-10-14", due))

  it("counts everything and, separately, what is due, with the cutoffs as strings", () => {
    assert.match(sql, /count\(\*\)::int AS n/i)
    assert.match(sql, /FILTER \(WHERE \(s\.updated_at < \(CASE WHEN s\.close_price_as_of IS NULL THEN \$\d+ ELSE \$\d+ END\)::timestamptz/i)
    assert.ok(params.includes("2026-10-14T22:00:00.000Z"))
    assert.ok(params.every((p) => !(p instanceof Date)))
  })

  it("treats everything as due without cutoffs", () => {
    assert.match(new PgDialect().sqlToQuery(unsettledHeldSql("2026-10-14")).sql, /FILTER \(WHERE true\)/i)
  })
})

describe("catchUpRecheckMinutes", () => {
  // Wed 2026-10-14: the close is 20:00Z (EDT), the catch-up starts 4:30pm ET = 20:30Z.
  const wait = (iso: string) => catchUpRecheckMinutes(new Date(iso), "2026-10-14", { earlyMinutes: 10 })

  it("keeps the short wait right after the bell, so the first catch-up still happens", () => {
    assert.equal(wait("2026-10-14T20:30:00Z"), 10)
    assert.equal(wait("2026-10-14T21:10:00Z"), 10)
  })
  it("backs off to a couple of hours once the window has passed", () => {
    assert.equal(wait("2026-10-14T21:30:00Z"), 120)
    assert.equal(wait("2026-10-15T00:00:00Z"), 120)
  })
  it("backs off further overnight and on weekends", () => {
    assert.equal(wait("2026-10-15T04:00:00Z"), 360)
    assert.equal(catchUpRecheckMinutes(new Date("2026-10-17T15:00:00Z"), "2026-10-16", { earlyMinutes: 10 }), 360)
  })
  it("handles winter time (4:30pm ET is 21:30Z)", () => {
    const winter = (iso: string) => catchUpRecheckMinutes(new Date(iso), "2026-12-02", { earlyMinutes: 10 })
    assert.equal(winter("2026-12-02T21:35:00Z"), 10)
    assert.equal(winter("2026-12-02T23:30:00Z"), 120)
  })
  it("leaves a forced run (0) alone", () => assert.equal(catchUpRecheckMinutes(new Date("2026-10-15T04:00:00Z"), "2026-10-14", { earlyMinutes: 0 }), 0))
  it("never waits less than asked", () => assert.equal(catchUpRecheckMinutes(new Date("2026-10-14T22:00:00Z"), "2026-10-14", { earlyMinutes: 300 }), 300))
})

describe("closeRecheckMinutes", () => {
  const ask = (iso: string, expectedDate: string) => closeRecheckMinutes(new Date(iso), expectedDate, { marketOpen: isUsMarketOpen(new Date(iso)), earlyMinutes: 10 })
  it("keeps the short interval while the market is open (target is the previous day)", () => {
    assert.equal(ask("2026-10-14T15:00:00Z", "2026-10-13"), 10) // 11:00 EDT
  })
  it("keeps the short interval after the bell until the capture opens", () => {
    assert.equal(ask("2026-10-14T20:15:00Z", "2026-10-13"), 10) // 16:15 EDT
  })
  it("backs off only once the session being caught up has closed", () => {
    assert.equal(ask("2026-10-14T21:00:00Z", "2026-10-14"), 10) // within the first 45 min
    assert.equal(ask("2026-10-14T22:30:00Z", "2026-10-14"), 120)
    assert.equal(ask("2026-10-15T08:00:00Z", "2026-10-14"), 360) // pre-market next morning
    assert.equal(ask("2026-10-17T15:00:00Z", "2026-10-16"), 360)
  })
  it("treats an early-close day by its own close", () => {
    assert.equal(ask("2026-11-27T18:10:00Z", "2026-11-25"), 10) // 13:10 EST, closed but not yet capturable
    assert.equal(ask("2026-11-27T20:00:00Z", "2026-11-27"), 120) // 15:00 EST
  })
})

describe("never-priced rows keep the short cutoff", () => {
  const dialect = new PgDialect()
  const short = new Date("2026-10-14T20:50:00.000Z")
  const long = new Date("2026-10-14T14:00:00.000Z")
  it("staleHeldSecurities compares a never-priced row against the short cutoff", () => {
    const { params } = dialect.sqlToQuery(staleHeldSecurities(new Date(0), { expectedDate: "2026-10-14", recheckBefore: long, neverPricedRecheckBefore: short, marketClosed: true })!)
    assert.ok(params.includes(short.toISOString()))
    assert.ok(params.includes(long.toISOString()))
  })
  it("unsettledHeldSql picks the cutoff by whether the row was ever priced", () => {
    const { sql, params } = dialect.sqlToQuery(unsettledHeldSql("2026-10-14", { recheckBefore: long, neverPricedRecheckBefore: short }))
    assert.match(sql, /CASE WHEN s\.close_price_as_of IS NULL/)
    assert.ok(params.includes(short.toISOString()) && params.includes(long.toISOString()))
  })
})

describe("fundNavMayBePublished", () => {
  it("is false in the evening before 7pm New York on the session's own day", () => {
    assert.equal(fundNavMayBePublished(new Date("2026-10-14T20:45:00Z"), "2026-10-14"), false)
    assert.equal(fundNavMayBePublished(new Date("2026-10-14T22:59:00Z"), "2026-10-14"), false)
  })
  it("is true from 7pm, and any time on a later day", () => {
    assert.equal(fundNavMayBePublished(new Date("2026-10-14T23:00:00Z"), "2026-10-14"), true)
    assert.equal(fundNavMayBePublished(new Date("2026-10-15T08:00:00Z"), "2026-10-14"), true)
    assert.equal(fundNavMayBePublished(new Date("2026-10-17T15:00:00Z"), "2026-10-16"), true)
  })
})

describe("closed-market gates", () => {
  const base = { expectedDate: "2026-10-13", recheckBefore: new Date("2026-10-13T20:00:00.000Z") }
  const text = (clause: ReturnType<typeof staleHeldSecurities>) => new PgDialect().sqlToQuery(clause!)

  it("drops the age-only branch while the market is closed, so a settled ticker never qualifies", () => {
    const open = text(staleHeldSecurities(new Date("2026-10-13T00:00:00.000Z"), { ...base }))
    const closed = text(staleHeldSecurities(new Date("2026-10-13T00:00:00.000Z"), { ...base, marketClosed: true }))
    assert.match(open.sql, /"updated_at" < \$\d+ or/i)
    assert.ok(closed.params.length < open.params.length)
    assert.ok(!closed.params.includes("2026-10-13T00:00:00.000Z"))
  })

  it("holds funds back until their NAV window", () => {
    const { sql, params } = text(staleHeldSecurities(new Date(), { ...base, marketClosed: true, fundNavOpen: false }))
    assert.match(sql, /"type" IS DISTINCT FROM 'mutual_fund'/)
    assert.equal(params.some((p) => p instanceof Date), false)
  })

  it("applies the fund gate to the unsettled count", () => {
    const { sql } = new PgDialect().sqlToQuery(unsettledHeldSql("2026-10-13", { recheckBefore: base.recheckBefore, fundNavOpen: false }))
    assert.match(sql, /s\.type IS DISTINCT FROM 'mutual_fund'/)
  })
})

describe("liveRefreshBroken", () => {
  it("is healthy when every claimed row was a fund skipped on purpose", () => {
    assert.equal(liveRefreshBroken({ provider: "alpaca", claimed: 3, funds: 3, refreshed: 0 }), false)
  })
  it("is unhealthy when every eligible claimed ticker failed", () => {
    assert.equal(liveRefreshBroken({ provider: "alpaca", claimed: 3, funds: 0, refreshed: 0 }), true)
    assert.equal(liveRefreshBroken({ provider: "alpaca", claimed: 3, funds: 1, refreshed: 0 }), true)
  })
  it("is healthy when something refreshed, nothing was claimed, or the run was skipped; an error is broken", () => {
    assert.equal(liveRefreshBroken({ claimed: 3, funds: 1, refreshed: 1 }), false)
    assert.equal(liveRefreshBroken({ claimed: 0, refreshed: 0 }), false)
    assert.equal(liveRefreshBroken({ skipped: "market_closed" }), false)
    assert.equal(liveRefreshBroken({ error: "boom" }), true)
  })
})
