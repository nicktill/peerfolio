import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { groupEndLabels, groupName, monotonePath, niceTicks, pointIndexAt, spreadLabels, tickDigits, xAt } from "./chart-math.ts"

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

describe("groupEndLabels", () => {
  const item = (id: string, value: number, y: number, isYou = false) => ({ id, label: id, isYou, value, y })

  it("puts players who finish level under one label, so none is pushed beside a neighbour's line", () => {
    const groups = groupEndLabels([item("Bennett", 0, 100), item("Andri", 0, 100), item("You", -0.34, 112, true), item("Nick", -2.2, 190)])
    assert.equal(groups.length, 3)
    assert.deepEqual(groups[0]!.names, ["Bennett", "Andri"])
    assert.equal(groups[0]!.value, 0)
  })

  it("treats returns that display the same as level", () => {
    const groups = groupEndLabels([item("A", 0.001, 50), item("B", -0.002, 50.02)])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]!.value, 0)
  })

  it("lists You first within a group and orders groups best to worst", () => {
    const groups = groupEndLabels([item("Sam", 1.5, 40), item("You", 1.5, 40, true), item("Priya", 3, 20), item("Jo", -1, 80)])
    assert.deepEqual(groups.map((g) => g.value), [3, 1.5, -1])
    assert.deepEqual(groups[1]!.names, ["You", "Sam"])
    assert.equal(groups[1]!.hasYou, true)
  })

  it("keeps different results apart", () => {
    assert.equal(groupEndLabels([item("A", 1.01, 10), item("B", 1.02, 12)]).length, 2)
  })
})

describe("groupName", () => {
  it("shows a single name, clipped if long", () => {
    assert.equal(groupName(["Bennett"], 12), "Bennett")
    assert.equal(groupName(["Bartholomew"], 6), "Barth…")
  })

  it("joins names that fit and falls back to a count when they don't", () => {
    assert.equal(groupName(["You", "Andri"], 12), "You · Andri")
    assert.equal(groupName(["Bennett", "Andri", "Sam"], 12), "3 tied")
  })
})

describe("monotonePath", () => {
  /** Every number in the path, grouped as [x, y] pairs after the leading command letters. */
  const pairs = (d: string) => [...d.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map((m) => [Number(m[1]), Number(m[2])] as const)

  it("is empty for nothing and a bare move for one point", () => {
    assert.equal(monotonePath([]), "")
    assert.equal(monotonePath([[5, 7]]), "M5.00,7.00")
  })

  it("is a straight line between two points, since there is nothing to smooth", () => {
    assert.equal(monotonePath([[0, 10], [100, 50]]), "M0.00,10.00 L100.00,50.00")
  })

  it("passes through every point", () => {
    const pts = [[0, 50], [10, 30], [20, 35], [30, 10]] as const
    const ends = pairs(monotonePath(pts)).filter((_, i) => i % 3 === 0 || i === 0)
    // M + one end per curve segment: the ends are every third pair after the first.
    const d = monotonePath(pts)
    for (const [x, y] of pts) assert.ok(d.includes(`${x.toFixed(2)},${y.toFixed(2)}`), `missing ${x},${y}`)
    assert.equal(ends.length > 0, true)
  })

  it("never overshoots: control points stay between the two readings of their segment", () => {
    // A sharp step would make an ordinary spline ring above and below it.
    const pts = [[0, 100], [10, 100], [20, 40], [30, 40], [40, 90], [50, 20]] as const
    const p = pairs(monotonePath(pts))
    for (let seg = 0; seg < pts.length - 1; seg++) {
      const lo = Math.min(pts[seg]![1], pts[seg + 1]![1])
      const hi = Math.max(pts[seg]![1], pts[seg + 1]![1])
      // Each curve segment contributes its two control points.
      for (const [, y] of [p[1 + seg * 3]!, p[2 + seg * 3]!]) assert.ok(y >= lo - 1e-6 && y <= hi + 1e-6, `segment ${seg}: ${y} outside ${lo}..${hi}`)
    }
  })

  it("keeps a flat stretch flat", () => {
    const p = pairs(monotonePath([[0, 20], [10, 20], [20, 20], [30, 5]]))
    assert.ok(p.slice(1, 7).every(([, y]) => y === 20))
  })
})
