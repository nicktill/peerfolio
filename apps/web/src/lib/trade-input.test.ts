import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { checkTradeInput, estimateShares, sanitizeAmount } from "./trade-input.ts"

describe("sanitizeAmount", () => {
  it("keeps a single decimal point and limits decimals", () => {
    assert.equal(sanitizeAmount("1.2.3", 2), "1.23")
    assert.equal(sanitizeAmount("12.3456", 2), "12.34")
    assert.equal(sanitizeAmount("0.12345678", 4), "0.1234")
  })

  it("drops non-numeric characters and pointless leading zeros", () => {
    assert.equal(sanitizeAmount("$1,000", 2), "1000")
    assert.equal(sanitizeAmount("007", 2), "7")
    assert.equal(sanitizeAmount("0.5", 2), "0.5")
    assert.equal(sanitizeAmount("0", 2), "0")
    assert.equal(sanitizeAmount("", 2), "")
  })
})

describe("checkTradeInput", () => {
  const limits = { cash: 1000, heldShares: 2.5 }

  it("asks for a ticker first", () => {
    const r = checkTradeInput("buy", "  ", "50", limits)
    assert.deepEqual(r, { ok: false, message: "Enter a ticker, like NVDA." })
  })

  it("accepts a buy within cash", () => {
    assert.deepEqual(checkTradeInput("buy", "NVDA", "100", limits), { ok: true, value: 100 })
    assert.deepEqual(checkTradeInput("buy", "NVDA", "1000", limits), { ok: true, value: 1000 })
  })

  it("rejects empty, sub-cent and over-budget buys with a plain message", () => {
    assert.equal(checkTradeInput("buy", "NVDA", "", limits).ok, false)
    assert.equal(checkTradeInput("buy", "NVDA", "0", limits).ok, false)
    assert.equal(checkTradeInput("buy", "NVDA", "0.001", limits).ok, false)
    assert.equal(checkTradeInput("buy", "NVDA", ".", limits).ok, false)
    const over = checkTradeInput("buy", "NVDA", "1000.01", limits)
    assert.deepEqual(over, { ok: false, message: "You only have $1,000.00 to spend." })
  })

  it("sells shares, 'all', and rejects what isn't owned", () => {
    assert.deepEqual(checkTradeInput("sell", "NVDA", "1.5", limits), { ok: true, value: 1.5 })
    assert.deepEqual(checkTradeInput("sell", "NVDA", "all", limits), { ok: true, value: "all" })
    assert.deepEqual(checkTradeInput("sell", "NVDA", "3", limits), { ok: false, message: "You only hold 2.5 shares." })
    assert.deepEqual(checkTradeInput("sell", "tsla", "1", { cash: 0, heldShares: null }), { ok: false, message: "You don't own any TSLA." })
    assert.equal(checkTradeInput("sell", "NVDA", "0", limits).ok, false)
  })
})

describe("estimateShares", () => {
  it("divides dollars by price", () => {
    assert.equal(estimateShares(100, 50), 2)
  })

  it("is null until there is a price and a positive amount", () => {
    assert.equal(estimateShares(100, null), null)
    assert.equal(estimateShares(100, 0), null)
    assert.equal(estimateShares(0, 50), null)
    assert.equal(estimateShares(Number.NaN, 50), null)
  })
})
