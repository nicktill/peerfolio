import assert from "node:assert/strict"
import { test } from "node:test"
import { dominantSource, downsample, historyBand, trendPath } from "./trend.ts"

test("downsample keeps short series and bounds long ones covering both ends", () => {
  assert.deepEqual(downsample([0.1, 0.2, 0.3], 60), [0.1, 0.2, 0.3])
  const long = Array.from({ length: 1000 }, (_, i) => i / 999)
  const d = downsample(long, 60)
  assert.equal(d.length, 60)
  assert.equal(d[0], 0)
  assert.equal(d[59], 1)
  assert.ok(d.every((x, i) => i === 0 || x >= d[i - 1]))
})

test("downsample drops non-finite values", () => {
  assert.deepEqual(downsample([0.5, NaN, 0.6]), [0.5, 0.6])
})

test("dominantSource keeps the busiest source", () => {
  const rows = [{ source: "a" }, { source: "b" }, { source: "b" }]
  assert.equal(dominantSource(rows).length, 2)
})

test("trendPath maps probability to height and flips", () => {
  assert.equal(trendPath([0.5]), "")
  assert.equal(trendPath([1, 0]), "M0.00 8.00L100.00 92.00")
  assert.equal(trendPath([1, 0], true), "M0.00 92.00L100.00 8.00")
  assert.equal(trendPath([2, -1]), "M0.00 8.00L100.00 92.00")
})

import { changeLabel, downsampleByTime, pointChange, sparkline, sparkScale, trendDescription, trendDirection, withLive } from "./trend.ts"

test("sparkScale enforces a minimum span, centres, and stays inside 0..1", () => {
  const a = sparkScale([0.55, 0.57])
  assert.ok(Math.abs(a.hi - a.lo - 0.12) < 1e-9)
  assert.ok(Math.abs((a.lo + a.hi) / 2 - 0.56) < 1e-9)
  const b = sparkScale([0.01, 0.02])
  assert.equal(b.lo, 0)
  assert.ok(Math.abs(b.hi - 0.12) < 1e-9)
  const c = sparkScale([0.99, 1])
  assert.equal(c.hi, 1)
  const d = sparkScale([0.1, 0.9])
  assert.ok(Math.abs(d.lo - 0.1) < 1e-9 && Math.abs(d.hi - 0.9) < 1e-9)
})

test("pointChange, direction and labels, with mirror", () => {
  assert.equal(pointChange([0.5, 0.54]), 4)
  assert.equal(pointChange([0.5, 0.54], true), -4)
  assert.equal(pointChange([0.5]), 0)
  assert.equal(trendDirection(0), "flat")
  assert.equal(trendDirection(1), "up")
  assert.equal(trendDirection(-1), "down")
  assert.equal(changeLabel(4), "+4")
  assert.equal(changeLabel(-3), "-3")
  assert.equal(changeLabel(0), "")
  assert.equal(trendDescription("Texans", 4), "Texans win chance up 4 points since kickoff")
  assert.equal(trendDescription("Texans", -1), "Texans win chance down 1 point since kickoff")
  assert.match(trendDescription("Texans", 0), /unchanged/)
})

test("sparkline auto-scales, puts the reference at the start value and ends on the live point", () => {
  const vals = [0.55, 0.56, 0.57]
  const s = sparkline(withLive(vals, 0.6))!
  assert.equal(s.change, 5)
  assert.equal(s.direction, "up")
  assert.ok(s.startY > s.last[1])
  assert.ok(s.last[1] >= 3 && s.startY <= 23)
  const m = sparkline(withLive(vals, 0.6), true)!
  assert.equal(m.direction, "down")
  assert.equal(sparkline([0.5]), null)
  assert.deepEqual(withLive([0.5], null), [0.5])
  assert.deepEqual(withLive([0.5], NaN), [0.5])
})

test("downsampleByTime buckets by time and keeps spikes and endpoints", () => {
  const samples = Array.from({ length: 200 }, (_, i) => ({ t: i < 100 ? i : 1000 + i, v: 0.5 }))
  samples[50]!.v = 0.9
  const d = downsampleByTime(samples, 20)
  assert.ok(d.length <= 20)
  assert.ok(d.includes(0.9))
  assert.equal(d[0], 0.5)
  assert.equal(downsampleByTime([{ t: 2, v: 0.2 }, { t: 1, v: 0.1 }], 60).join(), "0.1,0.2")
})

test("historyBand ends at the live split, uses real time on x, and needs enough history", () => {
  const series = Array.from({ length: 10 }, (_, i) => ({ t: i * 1000, v: 0.5 + i * 0.02 }))
  assert.equal(historyBand(series.slice(0, 3), null, 5000), null)
  const b = historyBand(series, 0.8, 20_000, 300, 16)!
  assert.equal(b.homePct, 80)
  assert.equal(b.awayPct, 20)
  assert.ok(b.line.startsWith("M0.0 8.0"), "first sample at the left edge, 50% down")
  assert.ok(b.line.endsWith("V3.2"), "last point is the live 80% home share (20% of the height from the top)")
  assert.ok(b.away.endsWith("H300V0H0Z"), "away polygon closes along the top edge")
  // A longer gap between samples takes proportionally more width (x is time, not sample count).
  const gap = historyBand([...series, { t: 100_000, v: 0.7 }], null, 100_000, 300, 16)!
  assert.ok(gap.line.includes("H27"), "the last sample is at 9% of the span, not 9/10")
})
