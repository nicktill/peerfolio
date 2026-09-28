import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { indexedDomain, rankReturns, visibleReturn } from "./return-display.ts"
import { applyTrade, portfolioValue, returnPct, type MemberState } from "./fantasy-rules.ts"

describe("fantasy return presentation", () => {
  it("stays at baseline after the screenshot's $100k purchases and database rounding", () => {
    for (const picks of [[341.07, 630.63], [137.42, 659.18, 177.82]]) {
      const state: MemberState = { cash: 100_000, positions: [] }
      for (const [i, price] of picks.entries()) {
        const amount = i === picks.length - 1 ? state.cash : 100_000 / picks.length
        const trade = applyTrade(state, { side: "buy", securityId: String(i), price, amount }, { maxPositionPct: null })
        state.cash += Number(trade.cashDelta.toFixed(6))
        state.positions.push({ securityId: String(i), shares: Number(trade.position!.shares.toFixed(8)), costBasis: Number(trade.position!.costBasis.toFixed(6)), price })
      }
      assert.equal(returnPct(portfolioValue(state), 100_000), 0)
      state.positions[0]!.price *= 1.01
      assert.ok(returnPct(portfolioValue(state), 100_000) > 0.3)
    }
  })

  it("keeps real cent-level gains while removing sub-cent storage noise", () => {
    assert.equal(returnPct(100_000.000002, 100_000), 0)
    assert.equal(returnPct(99_999.999998, 100_000), 0)
    assert.ok(returnPct(100_000.01, 100_000) > 0)
    assert.ok(returnPct(99_999.99, 100_000) < 0)
  })

  it("uses neutral direction for signed values that display as zero", () => {
    for (const value of [0, -0, 1e-9, -1e-9, 0.004, -0.004]) assert.equal(visibleReturn(value), 0)
    assert.equal(visibleReturn(0.006), 0.01)
    assert.equal(visibleReturn(-0.006), -0.01)
    assert.equal(visibleReturn(-0.04, 1), 0)
  })

  it("ties at displayed precision and preserves competition ranks", () => {
    assert.deepEqual(rankReturns([{ percent: -1 }, { percent: 0.000001 }, { percent: -0.000001 }, { percent: 0.02 }]).map(s => s.rank), [1, 2, 2, 4])
    assert.deepEqual(rankReturns([{ percent: 0 }, { percent: 0 }]).map(s => s.rank), [1, 1])
  })

  it("centers new and flat histories and never magnifies microscopic differences", () => {
    for (const points of [[], [100], [100, 100], [100, 100 + 1e-9]]) {
      const { lo, hi } = indexedDomain(points)
      assert.ok(hi - lo >= 1)
      assert.ok(Math.abs((100 - lo) / (hi - lo) - 0.5) < 1e-8)
    }
    const { lo, hi } = indexedDomain([95, 100, 120])
    assert.ok(lo < 95 && hi > 120)
  })
})
