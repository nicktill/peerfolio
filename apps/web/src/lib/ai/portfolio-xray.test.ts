import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { allocate, buildXRay } from "./portfolio-xray.ts"
import type { XRayPosition } from "./portfolio-xray.ts"

const pos = (over: Partial<XRayPosition>): XRayPosition => ({
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

describe("buildXRay risk", () => {
  const series = (values: number[]) => values.map((indexed, i) => ({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), indexed }))

  it("flags a deep drawdown and drops the volatility limitation once there is history", () => {
    const values = [100, 104, 96, 88, 90, 95, 99]
    const x = buildXRay({ positions: [pos({})], period: { percent: -1, days: 7, range: "3M" }, series: series(values) })
    assert.equal(x.risks.find((r) => r.id === "drawdown")?.severity, "watch")
    assert.ok(x.performance.risk!.maxDrawdown! > 15)
  })

  it("says volatility needs history when the series is short", () => {
    const x = buildXRay({ positions: [pos({})], series: series([100, 101, 102]) })
    assert.equal(x.performance.risk?.volatility, null)
    assert.ok(x.limitations.some((l) => l.includes("Volatility needs")))
  })

  it("has no risk block without a series", () => {
    assert.equal(buildXRay({ positions: [pos({})] }).performance.risk, null)
  })
})

describe("allocate", () => {
  it("groups by security type and sums to 100", () => {
    const a = allocate([pos({ type: "etf", value: 300 }), pos({ type: "equity", value: 100 }), pos({ type: "etf", value: 100 })])
    assert.equal(a[0]?.name, "ETFs")
    assert.ok(Math.abs(a.reduce((s, x) => s + x.percent, 0) - 100) < 1e-9)
  })
})

describe("sector exposure", () => {
  const stock = (id: string, value: number, sector: string | null) => pos({ securityId: id, ticker: id, type: "equity", value, sector })

  it("weights sectors across stocks and reports the largest against classified value", () => {
    const x = buildXRay({ positions: [stock("A", 300, "Technology"), stock("B", 100, "Technology"), stock("C", 100, "Energy"), pos({ securityId: "F", ticker: "F", type: "etf", value: 500 })] })
    const tech = x.sectors.slices.find((s) => s.name === "Technology")!
    assert.equal(tech.value, 400)
    assert.ok(Math.abs(tech.percent - 40) < 1e-9)
    assert.equal(x.sectors.slices.find((s) => s.name === "Funds & ETFs")?.kind, "bucket")
    assert.equal(x.sectors.stocks.value, 500)
    assert.equal(x.sectors.coverage, 100)
    assert.equal(x.sectors.partial, false)
    assert.equal(x.sectors.largest?.name, "Technology")
    assert.ok(Math.abs(x.sectors.largest!.percentOfClassified - 80) < 1e-9)
  })

  it("flags a sector tilt at 40% of classified value, only across enough holdings", () => {
    const tilted = buildXRay({ positions: [stock("A", 500, "Technology"), stock("B", 200, "Technology"), stock("C", 150, "Energy"), stock("D", 150, "Financials")] })
    const insight = tilted.risks.find((r) => r.id === "sector-tilt")
    assert.equal(insight?.severity, "watch")
    assert.match(insight!.summary, /rule-of-thumb/)
    const two = buildXRay({ positions: [stock("A", 500, "Technology"), stock("B", 500, "Energy")] })
    assert.equal(two.risks.some((r) => r.id === "sector-tilt"), false)
    const even = buildXRay({ positions: ["Technology", "Energy", "Financials", "Utilities", "Materials"].map((s, i) => stock(`S${i}`, 200, s)) })
    assert.equal(even.risks.some((r) => r.id === "sector-tilt"), false)
  })

  it("calls exposure partial under 60% coverage and says so in limitations, without inventing sectors", () => {
    const x = buildXRay({ positions: [stock("A", 200, "Technology"), stock("B", 800, null)] })
    assert.equal(x.sectors.coverage, 20)
    assert.equal(x.sectors.partial, true)
    const unknown = x.sectors.slices.find((s) => s.kind === "unclassified")
    assert.equal(unknown?.value, 800)
    assert.ok(x.limitations.some((l) => l.startsWith("Sector exposure is partial")))
    assert.equal(x.limitations.some((l) => l.includes("doesn't have reliable sector data")), false)
  })

  it("keeps good coverage honest about funds, and says plainly when there are no sectors", () => {
    const good = buildXRay({ positions: [stock("A", 500, "Technology"), stock("B", 500, "Energy")] })
    assert.ok(good.limitations.some((l) => l.includes("fund look-through") && !l.includes("partial")))
    const none = buildXRay({ positions: [stock("A", 500, null)] })
    assert.ok(none.limitations.some((l) => l.startsWith("Sector exposure isn't shown yet")))
    const funds = buildXRay({ positions: [pos({ securityId: "F", type: "etf", value: 1000 })] })
    assert.equal(funds.sectors.coverage, null)
    assert.equal(funds.sectors.largest, null)
    assert.ok(funds.limitations.some((l) => l.startsWith("Sector exposure isn't shown: you hold no individual stocks")))
  })

  it("keeps stocks the provider labelled but we can't map as Other, outside coverage and the tilt", () => {
    const x = buildXRay({ positions: [stock("A", 500, "Other"), stock("B", 500, "Energy")] })
    assert.equal(x.sectors.coverage, 50)
    assert.equal(x.sectors.largest?.name, "Energy")
  })

  it("treats crypto and cash as buckets even when a sector is stored", () => {
    const x = buildXRay({ positions: [pos({ securityId: "C", type: "cryptocurrency", value: 100, sector: "Technology" }), pos({ securityId: "D", type: "cash", value: 100 })] })
    assert.deepEqual(x.sectors.slices.map((s) => s.name).sort(), ["Cash & bonds", "Crypto"])
  })
})
