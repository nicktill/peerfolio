import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { tradeReceipt } from "./trade-receipt.ts"

describe("tradeReceipt", () => {
  it("a sale above average cost banks the difference", () => {
    const r = tradeReceipt({ side: "sell", shares: 100, price: 125, averageCost: 100 })
    assert.equal(r.value, 12_500)
    assert.equal(r.realized, 2_500)
    assert.equal(r.realizedPct, 25)
    assert.equal(r.outcome, "win")
  })

  it("a sale below average cost is a loss", () => {
    const r = tradeReceipt({ side: "sell", shares: 50, price: 90, averageCost: 100 })
    assert.equal(r.realized, -500)
    assert.equal(r.outcome, "loss")
  })

  it("selling at exactly what you paid is flat, not a win", () => {
    assert.equal(tradeReceipt({ side: "sell", shares: 10, price: 100, averageCost: 100 }).outcome, "flat")
    assert.equal(tradeReceipt({ side: "sell", shares: 3.33333333, price: 123.456, averageCost: 123.456 }).outcome, "flat")
  })

  it("a buy has nothing realised yet", () => {
    const r = tradeReceipt({ side: "buy", shares: 10, price: 50, averageCost: null })
    assert.equal(r.value, 500)
    assert.equal(r.realized, null)
    assert.equal(r.outcome, null)
  })

  it("doesn't guess when the cost is unknown", () => {
    assert.equal(tradeReceipt({ side: "sell", shares: 10, price: 50, averageCost: null }).outcome, null)
    assert.equal(tradeReceipt({ side: "sell", shares: 10, price: 50, averageCost: 0 }).outcome, null)
  })
})
