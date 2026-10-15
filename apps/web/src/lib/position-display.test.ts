import assert from "node:assert/strict"
import { test } from "node:test"
import { formatCost, formatPrice, formatShares, gainLabel, positionTitle } from "./position-display.ts"

test("shares: stocks cap at 2 decimals, crypto at 8, with separators", () => {
  assert.equal(formatShares(1234.5678, "stock"), "1,234.57")
  assert.equal(formatShares(10, "stock"), "10")
  assert.equal(formatShares(0.123456789, "crypto"), "0.12345679")
})

test("price is a 2-decimal currency", () => {
  assert.equal(formatPrice(1234.5), "$1,234.50")
})

test("average cost rounds to dollars from $100 and shows cents below", () => {
  assert.equal(formatCost(10_000, 100), "$100")
  assert.equal(formatCost(24_960, 100), "$250")
  assert.equal(formatCost(1_234.5, 100), "$12.35")
  assert.equal(formatCost(null, 10), null)
  assert.equal(formatCost(0, 10), null)
  assert.equal(formatCost(100, 0), null)
})

test("gain label for a gain, a loss, flat, and no basis", () => {
  assert.deepEqual(gainLabel(28_000, 25_620), { tone: "gain", dollars: "+$2,380", percent: "+9.29%" })
  assert.deepEqual(gainLabel(12_590, 13_000), { tone: "loss", dollars: "−$410", percent: "−3.15%" })
  assert.deepEqual(gainLabel(1_000, 1_000), { tone: "flat", dollars: "$0.00", percent: "0.00%" })
  assert.equal(gainLabel(500, null), null)
  assert.equal(gainLabel(500, 0), null)
})

test("small gains keep cents", () => {
  assert.equal(gainLabel(50.5, 40)?.dollars, "+$10.50")
  assert.equal(gainLabel(39.5, 40)?.dollars, "−$0.50")
})

test("title carries every detail", () => {
  const title = positionTitle({ ticker: "AAPL", name: "Apple Inc.", quantity: 10, kind: "stock", price: 200, value: 2000, costBasis: 1500 })
  assert.equal(title, "AAPL · Apple Inc. · 10 shares · price $200.00 · avg cost $150 · gain +$500 (+33.33%)")
  assert.match(positionTitle({ ticker: "X", name: null, quantity: 1, kind: "stock", price: 0, value: 0, costBasis: null }), /no cost basis/)
})
