import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { rangeStart, timeWeightedReturn } from "./ranges.ts"

const point = (date: string, investableAssets: number, netFlows = 0) => ({
  date,
  investableAssets,
  netWorth: investableAssets,
  netFlows,
})

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  )

describe("timeWeightedReturn", () => {
  it("reports a plain gain with no cash movement", () => {
    close(timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1100)]).percent, 10)
  })

  it("does not let a deposit inflate the return", () => {
    // Naive end/start would read +60%. The deposit must be divided out.
    close(timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1600, 500)]).percent, 10)
  })

  it("does not let a withdrawal depress the return", () => {
    close(timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 600, -500)]).percent, 10)
  })

  it("compounds periods rather than summing them", () => {
    // +10% then -10% is -1%, not 0%.
    close(
      timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1100), point("2026-01-03", 990)]).percent,
      -1,
    )
  })

  it("ranks a heavy depositor the same as someone who added nothing", () => {
    // This is the property the whole leaderboard rests on.
    const depositor = timeWeightedReturn([
      point("2026-01-01", 1000),
      point("2026-01-02", 1200),
      point("2026-01-03", 9440, 8000),
    ])
    const holder = timeWeightedReturn([
      point("2026-01-01", 1000),
      point("2026-01-02", 1200),
      point("2026-01-03", 1440),
    ])
    close(depositor.percent, holder.percent, 1e-9)
  })

  it("skips periods that open at zero instead of reporting infinite return", () => {
    close(timeWeightedReturn([point("2026-01-01", 0), point("2026-01-02", 5000, 5000)]).percent, 0)
  })

  it("clamps an absurd single period rather than detonating the chain", () => {
    // A mis-signed flow or a mid-window disconnect shouldn't produce -99999%.
    const summary = timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1_000_000)])
    assert.ok(summary.percent <= 100, `expected clamp at 100%, got ${summary.percent}`)
  })

  it("has no return from a single snapshot", () => {
    const summary = timeWeightedReturn([point("2026-01-01", 1000)])
    assert.equal(summary.percent, 0)
    assert.equal(summary.days, 1)
  })

  it("returns an empty summary with no snapshots", () => {
    assert.deepEqual(timeWeightedReturn([]).series, [])
  })

  it("indexes the series to 100 at the start", () => {
    const { series } = timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1100)])
    close(series[0]!.indexed, 100)
    close(series[1]!.indexed, 110)
  })
})

describe("rangeStart", () => {
  it("returns null for ALL so no lower bound is applied", () => {
    assert.equal(rangeStart("ALL"), null)
  })

  it("counts back the right number of days", () => {
    assert.equal(rangeStart("1W", new Date("2026-03-15T00:00:00Z")), "2026-03-08")
    assert.equal(rangeStart("1Y", new Date("2026-03-15T00:00:00Z")), "2025-03-15")
  })
})
