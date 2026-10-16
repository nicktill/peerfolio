import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildXRay } from "./portfolio-xray.ts"
import { digestXRay } from "./xray-digest.ts"

const pos = (id: string, ticker: string, value: number, type = "equity", sector: string | null = null) => ({
  securityId: id, ticker, name: ticker, type, quantity: 1, value, costBasis: value * 0.9, price: value, previousClose: value * 0.99, priceAsOf: "2026-10-15", sector,
})

describe("digestXRay", () => {
  const many = buildXRay({ positions: Array.from({ length: 14 }, (_, i) => pos(`s${i}`, `T${i}`, 1000 - i * 40, i % 3 === 0 ? "etf" : "equity", "Technology")), period: { percent: 3.2, days: 40, range: "3M" } })
  const digest = digestXRay(many)

  it("is far smaller than the full report", () => {
    assert.ok(JSON.stringify(digest).length < JSON.stringify(many).length * 0.6)
  })

  it("keeps lists short so an answer has to choose", () => {
    assert.ok(digest.largest.length <= 5)
    assert.ok(digest.mix.length <= 4)
    assert.ok(digest.flags.length <= 3)
    assert.ok(digest.movers.length <= 3)
  })

  it("quotes the report's own numbers", () => {
    assert.equal(digest.totalValue, Math.round(many.overview.totalValue))
    assert.equal(digest.holdings, many.overview.holdingCount)
    assert.equal(digest.period?.percent, 3.2)
    assert.equal(digest.concentration.top1Percent, Math.round(many.concentration.top1 * 10) / 10)
  })

  it("carries no follow-up prompts", () => {
    assert.ok(!JSON.stringify(digest).includes("followUp"))
  })

  it("copes with an empty portfolio", () => {
    const empty = digestXRay(buildXRay({ positions: [] }))
    assert.equal(empty.holdings, 0)
    assert.deepEqual(empty.flags, [])
  })
})
