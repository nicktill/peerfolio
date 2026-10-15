import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { MIN_VOL_OBSERVATIONS, riskMetrics, type IndexedPoint } from "./risk-metrics.ts"

/** Consecutive calendar days from 2026-09-01. */
const daily = (values: number[]): IndexedPoint[] =>
  values.map((indexed, i) => ({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), indexed }))

describe("riskMetrics", () => {
  it("returns null for fewer than two points", () => {
    assert.equal(riskMetrics([]), null)
    assert.equal(riskMetrics(daily([100])), null)
  })

  it("withholds volatility until there are enough steps", () => {
    const m = riskMetrics(daily([100, 101, 100, 102, 101, 103]))!
    assert.equal(m.volatility, null)
    assert.equal(m.observations, 5)
  })

  it("reports zero volatility for a perfectly steady series", () => {
    const steady = Array.from({ length: MIN_VOL_OBSERVATIONS + 2 }, (_, i) => 100 * 1.001 ** i)
    assert.ok(Math.abs(riskMetrics(daily(steady))!.volatility!) < 1e-6)
  })

  it("annualizes the standard deviation of daily returns", () => {
    // Alternating +1% / -1% steps: sample stdev is about 1%, so about 15.9% annualized.
    const v = [100]
    for (let i = 0; i < 30; i++) v.push(v[i]! * (i % 2 === 0 ? 1.01 : 0.99))
    const vol = riskMetrics(daily(v))!.volatility!
    assert.ok(vol > 15 && vol < 17, `got ${vol}`)
  })

  it("finds the largest peak-to-trough fall", () => {
    const m = riskMetrics(daily([100, 120, 90, 110, 80, 130]))!
    // Peak 120 to trough 80 = 33.3%.
    assert.ok(Math.abs(m.maxDrawdown! - 33.3333) < 0.01)
  })

  it("reports no drawdown for a series that only rises", () => {
    assert.equal(riskMetrics(daily([100, 101, 102, 103, 104]))!.maxDrawdown, 0)
  })

  it("finds the best and worst day", () => {
    const m = riskMetrics(daily([100, 110, 99, 100, 101]))!
    assert.equal(m.best?.date, "2026-09-02")
    assert.equal(m.worst?.date, "2026-09-03")
  })

  it("leaves out steps that span missing snapshots", () => {
    const m = riskMetrics([
      { date: "2026-09-01", indexed: 100 },
      { date: "2026-09-02", indexed: 101 },
      { date: "2026-09-20", indexed: 150 },
      { date: "2026-09-21", indexed: 151 },
    ])!
    assert.equal(m.observations, 2)
    assert.ok(m.best!.percent < 2)
  })
})
