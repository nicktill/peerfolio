import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildXRay } from "./portfolio-xray.ts"
import { chartSlices, chipsOf, flagsOf, verdictOf } from "./xray-view.ts"

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

describe("chartSlices", () => {
  const a = (name: string, percent: number) => ({ name, percent })
  it("keeps a short list as is, largest first", () => {
    assert.deepEqual(chartSlices([a("Cash", 5), a("Stocks", 70), a("ETFs", 25)]).map((s) => s.name), ["Stocks", "ETFs", "Cash"])
  })
  it("folds the tail into one Other slice and keeps the total", () => {
    const out = chartSlices([a("A", 40), a("B", 20), a("C", 15), a("D", 10), a("E", 8), a("F", 5), a("G", 2)])
    assert.deepEqual(out.map((s) => s.name), ["A", "B", "C", "D", "Other"])
    assert.equal(out.at(-1)!.other, true)
    assert.equal(Math.round(out.reduce((n, s) => n + s.percent, 0)), 100)
  })
  it("does not make an Other of a single leftover, and drops empty slices", () => {
    assert.deepEqual(chartSlices([a("A", 40), a("B", 20), a("C", 15), a("D", 10), a("E", 15), a("Z", 0)]).map((s) => s.name), ["A", "B", "C", "E", "D"])
  })
})
