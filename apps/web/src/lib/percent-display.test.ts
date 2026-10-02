import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { roundToTotal } from "./percent-display.ts"

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe("roundToTotal", () => {
  it("keeps four near-even picks at 100%, not 101%", () => {
    const rounded = roundToTotal([25.6, 24.8, 24.8, 24.8])
    // Rounding each on its own would show 26, 25, 25, 25.
    assert.deepEqual(rounded, [25, 25, 25, 25])
    assert.equal(sum(rounded), 100)
  })

  it("doesn't let thirds drop to 99%", () => {
    assert.deepEqual(roundToTotal([100 / 3, 100 / 3, 100 / 3]), [34, 33, 33])
  })

  it("sums to the rounded total when only the top picks are shown", () => {
    const rounded = roundToTotal([30.6, 20.6, 10.6])
    assert.equal(sum(rounded), 62)
  })

  it("works at one decimal place", () => {
    const rounded = roundToTotal([33.33, 33.33, 33.34], 1)
    assert.equal(Math.round(sum(rounded) * 10), 1000)
  })

  it("leaves already-clean values alone", () => {
    assert.deepEqual(roundToTotal([50, 30, 20]), [50, 30, 20])
    assert.deepEqual(roundToTotal([]), [])
  })
})
