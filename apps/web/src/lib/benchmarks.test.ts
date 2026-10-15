import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { BENCHMARKS, compareToBenchmark, isBenchmarkSymbol } from "./benchmarks.ts"

const port = [
  { date: "2026-09-02", indexed: 100 },
  { date: "2026-09-03", indexed: 102 },
  { date: "2026-09-04", indexed: 101 },
  { date: "2026-09-07", indexed: 105 },
]

describe("compareToBenchmark", () => {
  it("indexes the benchmark to the portfolio's first day and computes the gap", () => {
    const r = compareToBenchmark(port, [
      { date: "2026-09-02", close: 500 },
      { date: "2026-09-03", close: 505 },
      { date: "2026-09-04", close: 510 },
      { date: "2026-09-07", close: 520 },
    ])
    assert.ok(r.ok)
    assert.equal(r.value.series[0]!.indexed, 100)
    assert.ok(Math.abs(r.value.benchmarkPercent - 4) < 1e-9)
    assert.ok(Math.abs(r.value.portfolioPercent - 5) < 1e-9)
    assert.ok(Math.abs(r.value.differencePoints - 1) < 1e-9)
    assert.equal(r.value.coverage, 1)
  })

  it("carries the last close forward over a missing day but never reads a later one", () => {
    const r = compareToBenchmark(port, [
      { date: "2026-09-02", close: 100 },
      { date: "2026-09-04", close: 110 },
    ])
    assert.ok(r.ok)
    // 09-03 has no close, so it uses 09-02's; 09-07 uses 09-04's.
    const got = r.value.series.map((p) => p.indexed)
    const want = [100, 100, 110, 110]
    assert.equal(got.length, want.length)
    got.forEach((v, i) => assert.ok(Math.abs(v - want[i]!) < 1e-9, `${i}: ${v}`))
  })

  it("starts from the last close before the portfolio's first day when the market was closed", () => {
    const r = compareToBenchmark(
      [{ date: "2026-09-06", indexed: 100 }, { date: "2026-09-08", indexed: 101 }],
      [{ date: "2026-09-04", close: 200 }, { date: "2026-09-08", close: 210 }],
    )
    assert.ok(r.ok)
    assert.ok(Math.abs(r.value.benchmarkPercent - 5) < 1e-9)
  })

  it("refuses rather than invent a start when benchmark data begins after the portfolio", () => {
    const r = compareToBenchmark(port, [{ date: "2026-09-04", close: 510 }, { date: "2026-09-07", close: 520 }])
    assert.deepEqual(r, { ok: false, reason: "starts-late" })
  })

  it("refuses when the benchmark's nearest earlier close is too old to stand for the start", () => {
    const r = compareToBenchmark(port, [{ date: "2026-08-01", close: 400 }, { date: "2026-09-07", close: 520 }])
    assert.deepEqual(r, { ok: false, reason: "starts-late" })
  })

  it("reports missing history and missing benchmark data distinctly", () => {
    assert.deepEqual(compareToBenchmark([{ date: "2026-09-02", indexed: 100 }], [{ date: "2026-09-02", close: 1 }]), { ok: false, reason: "no-history" })
    assert.deepEqual(compareToBenchmark(port, []), { ok: false, reason: "no-benchmark-data" })
    assert.deepEqual(compareToBenchmark(port, [{ date: "2026-09-02", close: 0 }]), { ok: false, reason: "no-benchmark-data" })
  })

  it("handles unsorted closes", () => {
    const r = compareToBenchmark(port, [
      { date: "2026-09-07", close: 520 },
      { date: "2026-09-02", close: 500 },
    ])
    assert.ok(r.ok)
    assert.equal(r.value.series[0]!.indexed, 100)
  })
})

describe("benchmarks", () => {
  it("lists the supported symbols", () => {
    assert.deepEqual(BENCHMARKS.map((b) => b.symbol), ["SPY", "QQQ", "VTI"])
    assert.ok(isBenchmarkSymbol("SPY"))
    assert.ok(!isBenchmarkSymbol("AAPL"))
  })
})
