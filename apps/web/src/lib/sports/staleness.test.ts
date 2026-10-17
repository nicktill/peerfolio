import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { americanToDecimal, HOUSE_MARGIN, priceTwoWay } from "./odds.ts"
import { REPRICE } from "./reprice.ts"

/**
 * Expected value of taking the favourable side of a line whose fair probability has drifted `drift` since it was priced
 * (the "stale line" exploit), at the current house margin. EV per credit staked = (true fair prob) x decimal odds - 1.
 * The table is the numbers behind the residual-risk section of LIVE-ODDS.md.
 */
const bestEv = (p: number, drift: number) => {
  const [a, b] = priceTwoWay(p)!
  return Math.max((p + drift) * americanToDecimal(a), (1 - p + drift) * americanToDecimal(b)) - 1
}

describe("stale-line EV at the 2% margin", () => {
  const grid = [0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85]
  it("a fresh line always has negative EV (the house edge)", () => {
    for (const p of grid) assert.ok(bestEv(p, 0) < 0, `p=${p}`)
    assert.ok(bestEv(0.5, 0) <= -(HOUSE_MARGIN / 2) - 0.003)
  })
  it("drift the repricer ignores (under minMove) is worth at most about 3% EV, only on longshots; about 0.5% at an even game", () => {
    for (const p of grid) assert.ok(bestEv(p, REPRICE.minMove) <= 0.035, `p=${p} ev=${bestEv(p, REPRICE.minMove)}`)
    assert.ok(bestEv(0.5, REPRICE.minMove) < 0.01)
  })
  it("the largest drift a single step may carry (maxStep) is bounded, and longshots are excluded by minFair", () => {
    // Inside the repriced range [0.15, 0.85] a drift of maxStep is worth at most about 19% EV on a pick that is itself capped
    // by the stake and win limits; outside the range the market is frozen, not repriced.
    for (const p of grid) assert.ok(bestEv(p, REPRICE.maxStep) <= 0.2, `p=${p} ev=${bestEv(p, REPRICE.maxStep)}`)
    assert.ok(bestEv(0.5, REPRICE.maxStep) < 0.06)
    assert.ok(bestEv(0.35, REPRICE.maxStep) < 0.08)
  })
  it("EV rises monotonically with drift and is worst on longshots", () => {
    for (const p of grid) {
      const evs = [0, 0.015, 0.03, 0.04].map((d) => bestEv(p, d))
      assert.deepEqual([...evs].sort((x, y) => x - y), evs)
    }
    assert.ok(bestEv(0.15, 0.04) > bestEv(0.5, 0.04))
  })
})
