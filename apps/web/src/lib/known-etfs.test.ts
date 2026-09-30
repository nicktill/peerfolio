import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { KNOWN_ETFS, effectiveSecurityType } from "./known-etfs.ts"

describe("known ETFs", () => {
  it("has no duplicates or malformed tickers", () => {
    const raw = [...KNOWN_ETFS]
    assert.ok(raw.length > 100)
    for (const t of raw) assert.match(t, /^[A-Z]{2,5}$/, t)
  })

  it("covers the big index funds people actually hold", () => {
    for (const t of ["VOO", "QQQ", "VTI", "SPY", "AVUV", "GLD", "XLE", "TBT", "IVV", "SCHD"]) assert.ok(KNOWN_ETFS.has(t), t)
  })

  it("doesn't list ordinary stocks", () => {
    for (const t of ["AAPL", "NVDA", "HOOD", "PLTR", "AMD", "MSFT", "AMZN", "GOOGL", "FMCC", "TSM"]) assert.equal(KNOWN_ETFS.has(t), false, t)
  })
})

describe("effectiveSecurityType", () => {
  it("shows a known ETF as an ETF until the provider has been asked", () => {
    assert.equal(effectiveSecurityType("equity", "VOO", false), "etf")
    assert.equal(effectiveSecurityType("equity", "voo", false), "etf")
  })

  it("never overrides what the provider said", () => {
    assert.equal(effectiveSecurityType("equity", "VOO", true), "equity")
    assert.equal(effectiveSecurityType("etf", "AAPL", true), "etf")
  })

  it("leaves stocks, funds, crypto and unknowns alone", () => {
    assert.equal(effectiveSecurityType("equity", "AAPL", false), "equity")
    assert.equal(effectiveSecurityType("mutual_fund", "VTSAX", false), "mutual_fund")
    assert.equal(effectiveSecurityType("cryptocurrency", "BTC", false), "cryptocurrency")
    assert.equal(effectiveSecurityType(null, "VOO", false), null)
    assert.equal(effectiveSecurityType("equity", null, false), "equity")
  })
})
