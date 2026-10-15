import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isVisual, withVisual, type Visual } from "./visuals.ts"

describe("visuals", () => {
  it("accepts well-formed visuals and rejects the rest", () => {
    assert.equal(isVisual({ kind: "benchmark", label: "S&P 500", range: "1M", you: 2, benchmark: 1 }), true)
    assert.equal(isVisual({ kind: "benchmark", label: "S&P 500", range: "1M", you: "2", benchmark: 1 }), false)
    assert.equal(isVisual({ kind: "script" }), false)
    assert.equal(isVisual(null), false)
  })
  it("keeps one visual per kind", () => {
    const a: Visual = { kind: "movers", gainers: [], losers: [] }
    const b: Visual = { kind: "movers", gainers: [{ symbol: "X", changePercent: 1, held: false }], losers: [] }
    assert.deepEqual(withVisual(withVisual(undefined, a), b), [b])
  })
})
