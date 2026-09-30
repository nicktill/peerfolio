import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { allTimeGain, summarizeHoldings, todayChange, type PositionInput } from "./dashboard-math.ts"

const pos = (over: Partial<PositionInput>): PositionInput => ({
  securityId: "mkt:AAA", ticker: "AAA", name: "Aaa", type: "equity",
  quantity: 10, value: 1100, costBasis: 1000, price: 110, previousClose: 100, priceAsOf: "2026-09-29", ...over,
})

describe("summarizeHoldings", () => {
  it("merges the same security held in two accounts into one row", () => {
    const rows = summarizeHoldings([
      pos({ quantity: 10, value: 1100, costBasis: 1000 }),
      pos({ quantity: 5, value: 550, costBasis: 400 }),
      pos({ securityId: "mkt:BBB", ticker: "BBB", quantity: 1, value: 350, costBasis: null, price: 350, previousClose: 340 }),
    ])
    assert.equal(rows.length, 2)
    assert.equal(rows[0]!.ticker, "AAA")
    assert.equal(rows[0]!.quantity, 15)
    assert.equal(rows[0]!.value, 1650)
    assert.equal(rows[0]!.positions, 2)
    assert.equal(rows[0]!.gainAmount, 250)
    assert.ok(Math.abs(rows[0]!.gainPercent! - (250 / 1400) * 100) < 1e-9)
    assert.equal(rows[0]!.todayAmount, 150)
    assert.ok(Math.abs(rows[0]!.weight + rows[1]!.weight - 100) < 1e-9)
  })

  it("leaves gain and today empty when unknown, and skips zero-value rows", () => {
    const rows = summarizeHoldings([pos({ costBasis: null, previousClose: null }), pos({ securityId: "mkt:ZZZ", value: 0 })])
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.gainAmount, null)
    assert.equal(rows[0]!.todayAmount, null)
    assert.equal(rows[0]!.todayPercent, null)
  })
})

describe("todayChange", () => {
  it("sums the move against each previous close", () => {
    const change = todayChange([pos({}), pos({ securityId: "mkt:BBB", quantity: 2, value: 200, price: 100, previousClose: 105 })], 1300 + 500)
    assert.ok(change)
    assert.equal(change.amount, 100 - 10)
    assert.equal(change.asOf, "2026-09-29")
    assert.ok(Math.abs(change.percent - (90 / (1800 - 90)) * 100) < 1e-9)
  })

  it("says nothing when too little of the portfolio has a previous close", () => {
    assert.equal(todayChange([pos({}), pos({ securityId: "mkt:BBB", value: 5000, previousClose: null })], 6100), null)
    assert.equal(todayChange([], 0), null)
  })
})

describe("allTimeGain", () => {
  it("measures against cost only where a cost was entered", () => {
    const gain = allTimeGain([pos({}), pos({ securityId: "mkt:BBB", value: 500, costBasis: null })])
    assert.ok(gain)
    assert.equal(gain.amount, 100)
    assert.equal(gain.percent, 10)
    assert.ok(Math.abs(gain.coverage - 1100 / 1600) < 1e-9)
  })

  it("is null with no cost basis at all", () => {
    assert.equal(allTimeGain([pos({ costBasis: null })]), null)
  })
})
