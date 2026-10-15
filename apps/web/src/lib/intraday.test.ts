import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { intradayDeltas } from "./intraday.ts"

describe("intradayDeltas", () => {
  it("sums each position's move since the previous close and carries prices across gaps", () => {
    const bars = new Map([
      ["A", [{ t: "09:30", c: 101 }, { t: "09:40", c: 102 }]],
      ["B", [{ t: "09:35", c: 49 }]],
    ])
    const out = intradayDeltas([{ ticker: "A", quantity: 10, previousClose: 100 }, { ticker: "B", quantity: 20, previousClose: 50 }], bars)
    assert.deepEqual(out, [
      { t: "09:30", delta: 10 },
      { t: "09:35", delta: 10 - 20 },
      { t: "09:40", delta: 20 - 20 },
    ])
  })
  it("returns nothing when no position has bars", () => {
    assert.deepEqual(intradayDeltas([{ ticker: "A", quantity: 1, previousClose: 1 }], new Map()), [])
  })
})
