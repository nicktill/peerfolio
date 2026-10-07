import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { amountFromFraction, checkTradeInput, estimateShares, fractionFromAmount, sanitizeAmount, snapFraction } from "./trade-input.ts"

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

describe("snapFraction", () => {
  const spots = [0.1, 0.25, 0.5, 1]

  it("leaves values that sit between hotspots", () => {
    assert.deepEqual(snapFraction(0.17, spots, 0.04), { fraction: 0.17, snapped: false })
    assert.deepEqual(snapFraction(0, spots, 0.04), { fraction: 0, snapped: false })
  })

  it("snaps when the pointer is close, and prefers the nearer spot", () => {
    assert.deepEqual(snapFraction(0.12, spots, 0.04), { fraction: 0.1, snapped: true })
    assert.deepEqual(snapFraction(0.97, spots, 0.04), { fraction: 1, snapped: true })
    assert.deepEqual(snapFraction(1.4, spots, 0.04), { fraction: 1, snapped: true })
  })

  it("keeps a caught hotspot until the pointer is pulled farther away", () => {
    assert.deepEqual(snapFraction(0.15, spots, 0.04, 0.1), { fraction: 0.1, snapped: true })
    assert.deepEqual(snapFraction(0.2, spots, 0.04, 0.1), { fraction: 0.2, snapped: false })
  })
})

describe("amountFromFraction", () => {
  it("maps buy positions onto dollars, and an empty field at zero", () => {
    assert.equal(amountFromFraction("buy", 0, 10_000, false), "")
    assert.equal(amountFromFraction("buy", 0.1, 10_000, true), "1000")
    assert.equal(amountFromFraction("buy", 1, 10_000.009, true), "10000")
    assert.equal(amountFromFraction("buy", 0.33, 100, false), "33")
  })

  it("maps sell positions onto shares, and the far end onto all", () => {
    assert.equal(amountFromFraction("sell", 0.25, 8, true), "2")
    assert.equal(amountFromFraction("sell", 0.4, 10, false), "4")
    assert.equal(amountFromFraction("sell", 1, 8, true), "all")
    assert.equal(fractionFromAmount("all", 8), 1)
    assert.equal(fractionFromAmount("2", 8), 0.25)
    assert.equal(fractionFromAmount("", 8), 0)
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
