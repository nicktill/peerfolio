import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildXRay } from "./portfolio-xray.ts"
import { chipsOf, flagsOf, verdictOf } from "./xray-view.ts"

const pos = (id: string, ticker: string, value: number, type = "equity", sector: string | null = null) => ({
  securityId: id, ticker, name: ticker, type, quantity: 1, value, costBasis: null, price: value, previousClose: value, priceAsOf: "2026-10-15", sector,
})

describe("xray view", () => {
  const x = buildXRay({ positions: [pos("a", "AAA", 600), pos("b", "BBB", 200), pos("c", "CCC", 100), pos("d", "DDD", 100)] })
  it("opens with one plain sentence about what it is made of and what leads", () => {
    const v = verdictOf(x)
    assert.match(v, /^Mostly stocks \(100%\), with AAA making up 60\.0% on its own\./)
  })
  it("ranks flags by severity and puts each against its line", () => {
    const flags = flagsOf(x)
    assert.equal(flags[0]!.id, "single-holding")
    assert.deepEqual(flags[0]!.threshold, { value: 60, line: 25, unit: "%" })
    assert.equal(flags[0]!.metric, "60.0%")
  })
  it("offers a few distinct questions", () => {
    const chips = chipsOf(x)
    assert.ok(chips.length >= 1 && chips.length <= 3)
    assert.equal(new Set(chips).size, chips.length)
  })
})
