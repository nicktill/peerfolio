import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isVisual, linePath, thin, withVisual, type Visual } from "./visuals.ts"

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
  it("keeps only the newest two cards in a reply", () => {
    const market: Visual = { kind: "market", session: "open", indexes: [], sectors: [] }
    const movers: Visual = { kind: "movers", gainers: [], losers: [] }
    const earnings: Visual = { kind: "earnings", days: [] }
    const list = withVisual(withVisual(withVisual(undefined, market), movers), earnings)
    assert.deepEqual(list.map((v) => v.kind), ["movers", "earnings"])
  })
})

describe("benchmark lines", () => {
  const base = { kind: "benchmark", label: "S&P 500", range: "3M", you: 4, benchmark: 3 }
  it("accepts a visual with or without its lines, and rejects malformed lines", () => {
    assert.equal(isVisual(base), true)
    assert.equal(isVisual({ ...base, lines: { you: [100, 104], bench: [100, 103] } }), true)
    assert.equal(isVisual({ ...base, lines: { you: [100], bench: [100, 103] } }), false)
    assert.equal(isVisual({ ...base, lines: { you: [100, "x"], bench: [100, 103] } }), false)
    assert.equal(isVisual({ ...base, lines: { you: Array(500).fill(1), bench: [1, 2] } }), false)
  })
  it("thins a long series to its ends and an even spread", () => {
    const v = Array.from({ length: 200 }, (_, i) => i)
    const t = thin(v, 20)
    assert.equal(t.length, 20)
    assert.equal(t[0], 0)
    assert.equal(t.at(-1), 199)
    assert.deepEqual(thin([1, 2, 3], 20), [1, 2, 3])
  })
  it("draws a path inside its box, higher values higher", () => {
    assert.equal(linePath([0, 10], 0, 10, 100, 40), "M0.00 40.00 L100.00 0.00")
    assert.equal(linePath([5, 5], 5, 5, 100, 40), "M0.00 40.00 L100.00 40.00")
  })
})
