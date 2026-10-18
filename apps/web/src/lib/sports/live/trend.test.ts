import assert from "node:assert/strict"
import { test } from "node:test"
import { dominantSource, downsample, trendPath } from "./trend.ts"

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
