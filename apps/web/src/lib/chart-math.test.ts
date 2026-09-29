import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { niceTicks, pointIndexAt, spreadLabels, tickDigits, xAt } from "./chart-math.ts"

describe("niceTicks", () => {
  it("picks round values and always includes 0 when it's in range", () => {
    // The league range from the screenshot: a couple of percent down to a fraction up.
    assert.deepEqual(niceTicks(-2.6, 0.6), [-2, -1, 0])
    assert.ok(niceTicks(-0.6, 0.6).includes(0))
  })

  it("stays inside the range", () => {
    for (const [lo, hi] of [[-2.6, 0.6], [-0.6, 0.6], [-12, 30], [0, 0.05]] as const) {
      for (const t of niceTicks(lo, hi)) assert.ok(t >= lo - 1e-9 && t <= hi + 1e-9, `${t} outside ${lo}..${hi}`)
    }
  })

  it("scales the step to the range", () => {
    assert.deepEqual(niceTicks(-10, 10, 4), [-10, -5, 0, 5, 10])
    assert.deepEqual(niceTicks(-1, 1, 4), [-1, -0.5, 0, 0.5, 1])
  })

  it("has no float noise", () => {
    for (const t of niceTicks(-0.9, 0.9, 6)) assert.equal(String(t).length < 8, true, String(t))
  })

  it("returns nothing for an empty or invalid range", () => {
    assert.deepEqual(niceTicks(1, 1), [])
    assert.deepEqual(niceTicks(2, 1), [])
    assert.deepEqual(niceTicks(Number.NaN, 1), [])
  })
})

describe("tickDigits", () => {
  it("shows more decimals for finer steps", () => {
    assert.equal(tickDigits([-10, -5, 0, 5]), 0)
    assert.equal(tickDigits([-1, -0.5, 0, 0.5]), 1)
    assert.equal(tickDigits([0, 0.05, 0.1]), 2)
    assert.equal(tickDigits([0]), 1)
  })
})

describe("spreadLabels", () => {
  it("leaves well-separated labels where they are", () => {
    assert.deepEqual(spreadLabels([10, 50, 90], 14, 0, 100), [10, 50, 90])
  })

  it("pushes overlapping labels apart while keeping their order", () => {
    const out = spreadLabels([50, 51, 52], 14, 0, 100)
    assert.ok(out[1]! - out[0]! >= 14 - 1e-9 && out[2]! - out[1]! >= 14 - 1e-9)
    assert.ok(out[0]! < out[1]! && out[1]! < out[2]!)
  })

  it("returns positions in the original order, not sorted order", () => {
    const out = spreadLabels([90, 10, 50], 14, 0, 100)
    assert.deepEqual(out, [90, 10, 50])
  })

  it("stays inside the bounds even when everything is at the bottom", () => {
    const out = spreadLabels([99, 99, 99], 14, 0, 100)
    for (const y of out) assert.ok(y >= 0 && y <= 100)
    const sorted = [...out].sort((a, b) => a - b)
    assert.ok(sorted[1]! - sorted[0]! >= 14 - 1e-9 && sorted[2]! - sorted[1]! >= 14 - 1e-9)
  })

  it("handles empty and single labels", () => {
    assert.deepEqual(spreadLabels([], 14, 0, 100), [])
    assert.deepEqual(spreadLabels([120], 14, 0, 100), [100])
  })
})

describe("pointIndexAt and xAt", () => {
  it("maps a pointer position to the nearest point", () => {
    assert.equal(pointIndexAt(40, 40, 400, 5), 0)
    assert.equal(pointIndexAt(440, 40, 400, 5), 4)
    assert.equal(pointIndexAt(240, 40, 400, 5), 2)
  })

  it("clamps outside the plot and handles tiny series", () => {
    assert.equal(pointIndexAt(-50, 40, 400, 5), 0)
    assert.equal(pointIndexAt(9999, 40, 400, 5), 4)
    assert.equal(pointIndexAt(100, 40, 400, 1), 0)
  })

  it("places points evenly, and a lone point at the right edge", () => {
    assert.equal(xAt(0, 3, 40, 400), 40)
    assert.equal(xAt(1, 3, 40, 400), 240)
    assert.equal(xAt(2, 3, 40, 400), 440)
    assert.equal(xAt(0, 1, 40, 400), 440)
  })
})
