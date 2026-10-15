import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { describeTicker, issuesByTicker, nextSessionOpen, sessionsBehind, type TickerInput } from "./ticker-freshness-core.ts"

// 2026-10-14 is a Wednesday; New York is on daylight time, so the bell is 13:30 UTC.
const open = new Date("2026-10-14T15:00:00Z")
const evening = new Date("2026-10-14T23:00:00Z")
const REFRESH = 120

const stock = (over: Partial<TickerInput> = {}): TickerInput => ({
  marketTicker: "AAPL",
  type: "equity",
  asOf: "2026-10-14",
  final: false,
  pricedAt: new Date("2026-10-14T14:58:00Z"),
  updatedAt: new Date("2026-10-14T14:58:00Z"),
  ...over,
})

describe("describeTicker, market open", () => {
  it("calls a recently priced ticker live and says when it is next asked", () => {
    const s = describeTicker(stock(), open, REFRESH)
    assert.equal(s.status, "live")
    assert.equal(s.nextAttemptAt, "2026-10-14T15:00:00.000Z")
  })

  it("queues one priced earlier today but not recently", () => {
    const s = describeTicker(stock({ pricedAt: new Date("2026-10-14T13:40:00Z"), updatedAt: new Date("2026-10-14T14:40:00Z") }), open, REFRESH)
    assert.equal(s.status, "pending")
  })

  it("does not call yesterday's final close live just because a trigger rewrote it a minute ago", () => {
    const s = describeTicker(stock({ asOf: "2026-10-13", final: true, pricedAt: new Date("2026-10-14T14:59:00Z") }), open, REFRESH)
    assert.notEqual(s.status, "live")
    assert.equal(s.status, "behind")
  })

  it("flags a ticker with no price yet today as behind", () => {
    const s = describeTicker(stock({ asOf: "2026-10-13", final: true, pricedAt: null }), open, REFRESH)
    assert.equal(s.status, "behind")
  })

  it("shows a ticker nobody can quote as parked, with the time it is asked again", () => {
    const s = describeTicker(stock({ asOf: "2026-10-13", final: true, pricedAt: null, updatedAt: new Date("2026-10-15T14:58:00Z") }), open, REFRESH)
    assert.equal(s.label, "Parked")
    assert.equal(s.nextAttemptAt, "2026-10-15T15:00:00.000Z")
  })
})

describe("describeTicker, market closed", () => {
  it("is current with the official close, and points at the next open", () => {
    const s = describeTicker(stock({ final: true }), evening, REFRESH)
    assert.equal(s.status, "current")
    assert.equal(s.nextAttemptAt, "2026-10-15T13:30:00.000Z")
  })

  it("is pending while only a live price is stored for the day", () => {
    assert.equal(describeTicker(stock({ final: false }), evening, REFRESH).status, "pending")
  })

  it("is behind when yesterday's close is the newest", () => {
    assert.equal(describeTicker(stock({ asOf: "2026-10-13", final: true }), evening, REFRESH).status, "behind")
  })
})

describe("describeTicker, funds, brokerage, crypto", () => {
  const fund = (asOf: string): TickerInput => ({ marketTicker: "FSPSX", type: "mutual_fund", asOf, final: true, pricedAt: null, updatedAt: evening })

  it("treats a fund one NAV behind as pending and two as behind", () => {
    assert.equal(describeTicker(fund("2026-10-14"), evening, REFRESH).status, "current")
    assert.equal(describeTicker(fund("2026-10-13"), evening, REFRESH).status, "pending")
    assert.equal(describeTicker(fund("2026-10-12"), evening, REFRESH).status, "behind")
  })

  it("leaves tickerless securities to the brokerage", () => {
    const s = describeTicker({ marketTicker: null, type: "fund", asOf: null, final: true, pricedAt: null, updatedAt: evening }, evening, REFRESH)
    assert.equal(s.status, "brokerage")
    assert.equal(s.nextAttemptAt, null)
  })

  it("only expects a daily close for crypto", () => {
    const btc = (asOf: string): TickerInput => ({ marketTicker: "X:BTCUSD", type: "crypto", asOf, final: true, pricedAt: null, updatedAt: evening })
    assert.equal(describeTicker(btc("2026-10-14"), evening, REFRESH).status, "current")
    assert.equal(describeTicker(btc("2026-10-10"), evening, REFRESH).status, "behind")
  })
})

describe("nextSessionOpen and sessionsBehind", () => {
  it("skips the weekend", () => {
    assert.equal(nextSessionOpen(new Date("2026-10-16T21:00:00Z"))?.toISOString(), "2026-10-19T13:30:00.000Z")
  })

  it("counts weekdays between two dates", () => {
    assert.equal(sessionsBehind("2026-10-14", "2026-10-14"), 0)
    assert.equal(sessionsBehind("2026-10-13", "2026-10-14"), 1)
    assert.equal(sessionsBehind("2026-10-09", "2026-10-12"), 1)
  })
})

describe("issuesByTicker", () => {
  const events = [
    { at: "2026-10-14T20:00:00Z", provider: "finnhub", kind: "denied", reason: "budget spent", symbols: ["AAPL", "OGI"] },
    { at: "2026-10-14T19:00:00Z", provider: "finnhub", kind: "failed", reason: "403", symbols: ["OGI"] },
    { at: "2026-10-14T18:00:00Z", provider: "massive", kind: "rate_limited", reason: "429", symbols: ["XYZ"] },
  ]

  it("counts by kind and keeps the newest event, only for wanted tickers", () => {
    const out = issuesByTicker(events, new Set(["OGI", "AAPL"]))
    assert.deepEqual(out.get("OGI"), { denied: 1, rateLimited: 0, failed: 1, last: { at: "2026-10-14T20:00:00Z", provider: "finnhub", kind: "denied", reason: "budget spent" } })
    assert.equal(out.get("AAPL")?.denied, 1)
    assert.equal(out.has("XYZ"), false)
  })
})
