import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { demoBenchmark } from "./demo-benchmark.ts"

const dates = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 8, i + 1)).toISOString().slice(0, 10))
const points = dates.map((date, i) => ({ date, indexed: 100 + i / 5 }))

describe("demo benchmark histories", () => {
  it("uses consistent overlapping history, rebased for each window", () => {
    for (const symbol of ["SPY", "QQQ", "VTI"]) {
      const full = demoBenchmark(symbol, points).comparison!
      const subset = demoBenchmark(symbol, points.slice(15)).comparison!
      assert.equal(full.series[0]!.indexed, 100)
      assert.equal(subset.series[0]!.indexed, 100)
      assert.ok(Math.abs(subset.series.at(-1)!.indexed - full.series.at(-1)!.indexed / full.series[15]!.indexed * 100) < 1e-10)
      assert.equal(full.differencePoints, full.portfolioPercent - full.benchmarkPercent)
      assert.deepEqual(full.series.map((p) => p.date), dates)
    }
  })
  it("keeps the three benchmarks distinct and handles insufficient history", () => {
    assert.notEqual(demoBenchmark("SPY", points).comparison!.benchmarkPercent, demoBenchmark("QQQ", points).comparison!.benchmarkPercent)
    assert.notEqual(demoBenchmark("SPY", points).comparison!.benchmarkPercent, demoBenchmark("VTI", points).comparison!.benchmarkPercent)
    assert.equal(demoBenchmark("SPY", []).reason, "no-history")
  })
})
