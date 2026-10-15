import assert from "node:assert/strict"
import { test } from "node:test"
import { advance, buildFrames, clampIndex, gapPoints, nextIndex, nextSpeed, stepsPerSecond } from "./replay.ts"

const history = [
  { date: "2026-01-01", netWorth: 1000 },
  { date: "2026-01-02", netWorth: 1100 }, // includes a 50 deposit
  { date: "2026-01-03", netWorth: 1045 },
  { date: "2026-01-04", netWorth: 1100 },
]
const performance = [
  { date: "2026-01-01", indexed: 100 },
  { date: "2026-01-02", indexed: 105 },
  { date: "2026-01-03", indexed: 99.75 },
  { date: "2026-01-04", indexed: 105.2 },
]

test("one frame per date, return from the indexed series", () => {
  const f = buildFrames({ history, performance })
  assert.equal(f.length, 4)
  assert.equal(f[0]!.indexedReturnPercent, 0)
  assert.ok(Math.abs(f[1]!.indexedReturnPercent - 5) < 1e-9)
  assert.equal(f[1]!.value, 1100)
  assert.equal(f[0]!.dayChangePercent, null)
  assert.ok(Math.abs(f[2]!.dayChangePercent! - (99.75 / 105 - 1) * 100) < 1e-9)
})

test("dollar day change is net of flows, and null without them", () => {
  const without = buildFrames({ history, performance })
  assert.ok(without.every((f) => f.dayChangeAmount === null))
  const withFlows = buildFrames({ history, performance, netFlows: { "2026-01-02": 50 } })
  assert.equal(withFlows[0]!.dayChangeAmount, null)
  assert.equal(withFlows[1]!.dayChangeAmount, 50) // 1100 - 1000 - 50
  assert.equal(withFlows[2]!.dayChangeAmount, null) // no flow recorded for that date: unknown, not zero
})

test("running high and drawdown follow the return series", () => {
  const f = buildFrames({ history, performance })
  assert.equal(f[1]!.runningHigh, 105)
  assert.equal(f[1]!.drawdownFromPeakPercent, 0)
  assert.equal(f[2]!.runningHigh, 105)
  assert.ok(Math.abs(f[2]!.drawdownFromPeakPercent - (99.75 / 105 - 1) * 100) < 1e-9)
  assert.equal(f[3]!.runningHigh, 105.2)
  assert.equal(f[3]!.drawdownFromPeakPercent, 0)
})

test("two points and a flat series", () => {
  const two = buildFrames({ history: history.slice(0, 2), performance: performance.slice(0, 2) })
  assert.equal(two.length, 2)
  const flat = buildFrames({
    history: history.map((h) => ({ ...h, netWorth: 500 })),
    performance: performance.map((p) => ({ ...p, indexed: 100 })),
  })
  assert.ok(flat.every((f) => f.indexedReturnPercent === 0 && f.drawdownFromPeakPercent === 0 && (f.dayChangePercent === null || f.dayChangePercent === 0)))
  assert.equal(buildFrames({ history: [], performance: [] }).length, 0)
})

test("a date missing from history is skipped, never invented", () => {
  const f = buildFrames({ history: history.filter((h) => h.date !== "2026-01-03"), performance })
  assert.deepEqual(f.map((x) => x.date), ["2026-01-01", "2026-01-02", "2026-01-04"])
})

test("benchmark dates it lacks are null, and the gap follows", () => {
  const benchmark = [
    { date: "2026-01-01", indexed: 100 },
    { date: "2026-01-02", indexed: 101 },
    { date: "2026-01-04", indexed: 103 },
  ]
  const f = buildFrames({ history, performance, benchmark })
  assert.equal(f[0]!.benchmarkReturnPercent, 0)
  assert.equal(f[1]!.benchmarkReturnPercent, 1)
  assert.equal(f[2]!.benchmarkReturnPercent, null)
  assert.equal(gapPoints(f[2]!), null)
  assert.ok(Math.abs(gapPoints(f[3]!)! - 2.2) < 1e-9)
  assert.ok(buildFrames({ history, performance, benchmark: [] }).every((x) => x.benchmarkReturnPercent === null))
})

test("clamping and stepping stop at the ends", () => {
  assert.equal(clampIndex(-3, 5), 0)
  assert.equal(clampIndex(9, 5), 4)
  assert.equal(clampIndex(2.6, 5), 3)
  assert.equal(clampIndex(1, 0), 0)
  assert.equal(clampIndex(NaN, 5), 0)
  assert.equal(nextIndex(0, -1, 5), 0)
  assert.equal(nextIndex(4, 1, 5), 4)
  assert.equal(nextIndex(2, 1, 5), 3)
  assert.equal(nextIndex(2, 1, 5, 10), 4)
})

test("speeds are exact multiples within bounds", () => {
  assert.equal(stepsPerSecond(2, 31), 2 * stepsPerSecond(1, 31))
  assert.equal(stepsPerSecond(4, 31), 4 * stepsPerSecond(1, 31))
  assert.equal(stepsPerSecond(1, 5), 3)
  assert.equal(stepsPerSecond(1, 5000), 30)
  assert.equal(nextSpeed(1), 2)
  assert.equal(nextSpeed(2), 4)
  assert.equal(nextSpeed(4), 1)
})

test("advance moves by time and stops at the end", () => {
  const sps = stepsPerSecond(1, 31)
  const a = advance(0, 1, 1, 31)
  assert.ok(Math.abs(a.position - sps) < 1e-9 && !a.done)
  const b = advance(29.5, 5, 4, 31)
  assert.deepEqual(b, { position: 30, done: true })
  assert.deepEqual(advance(3, 0, 1, 31), { position: 3, done: false })
  assert.deepEqual(advance(0, 1, 1, 1), { position: 0, done: true })
  assert.deepEqual(advance(0, 1, 1, 0), { position: 0, done: true })
})
