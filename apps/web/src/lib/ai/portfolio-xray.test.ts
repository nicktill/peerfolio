import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { allocate, buildXRay } from "./portfolio-xray.ts"
import type { PositionInput } from "../dashboard-math.ts"

const pos = (over: Partial<PositionInput>): PositionInput => ({
  securityId: "mkt:AAA", ticker: "AAA", name: "Aaa", type: "equity",
  quantity: 10, value: 1000, costBasis: 800, price: 100, previousClose: 99, priceAsOf: "2026-10-13", ...over,
})

describe("buildXRay", () => {
  it("computes concentration from weights", () => {
    const x = buildXRay({ positions: [pos({ securityId: "a", ticker: "A", value: 600 }), pos({ securityId: "b", ticker: "B", value: 300 }), pos({ securityId: "c", ticker: "C", value: 100 })] })
    assert.equal(x.overview.holdingCount, 3)
    assert.ok(Math.abs(x.concentration.top1 - 60) < 1e-9)
    assert.ok(Math.abs(x.concentration.top3 - 100) < 1e-9)
    assert.ok(Math.abs(x.concentration.hhi - 0.46) < 1e-9)
    assert.ok(Math.abs(x.concentration.effectiveHoldings - 1 / 0.46) < 1e-9)
  })

  it("flags a dominant holding as notable and lists it first", () => {
    const x = buildXRay({ positions: [pos({ securityId: "a", ticker: "A", value: 800 }), pos({ securityId: "b", ticker: "B", value: 200 })] })
    assert.equal(x.risks[0]?.id, "single-holding")
    assert.equal(x.risks[0]?.severity, "notable")
  })

  it("flags nothing for a balanced portfolio of funds", () => {
    const positions = Array.from({ length: 8 }, (_, i) => pos({ securityId: `f${i}`, ticker: `F${i}`, type: "etf", value: 100 }))
    assert.deepEqual(buildXRay({ positions }).risks, [])
  })

  it("counts a security held in two accounts once", () => {
    const x = buildXRay({ positions: [pos({ value: 500 }), pos({ value: 500 }), pos({ securityId: "b", ticker: "B", value: 1000 })] })
    assert.equal(x.overview.holdingCount, 2)
    assert.equal(x.overview.positionCount, 3)
    assert.equal(x.concentration.multiAccount[0]?.accounts, 2)
  })

  it("never invents period performance or sector data", () => {
    const x = buildXRay({ positions: [pos({})] })
    assert.equal(x.performance.period, null)
    assert.ok(x.limitations.some((l) => l.includes("Sector")))
    assert.ok(x.limitations.some((l) => l.includes("history")))
  })

  it("handles an empty portfolio", () => {
    const x = buildXRay({ positions: [] })
    assert.equal(x.overview.totalValue, 0)
    assert.equal(x.concentration.hhi, 0)
    assert.equal(x.asOf, null)
    assert.deepEqual(x.risks, [])
  })

  it("passes through a supported period return", () => {
    const x = buildXRay({ positions: [pos({})], period: { percent: 4.2, days: 30, range: "1M" } })
    assert.equal(x.performance.period?.percent, 4.2)
  })
})

describe("allocate", () => {
  it("groups by security type and sums to 100", () => {
    const a = allocate([pos({ type: "etf", value: 300 }), pos({ type: "equity", value: 100 }), pos({ type: "etf", value: 100 })])
    assert.equal(a[0]?.name, "ETFs")
    assert.ok(Math.abs(a.reduce((s, x) => s + x.percent, 0) - 100) < 1e-9)
  })
})
