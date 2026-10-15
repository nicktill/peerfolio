import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { MAX_LEAGUE_OVERVIEW, parseArgs, parseBenchmark, parseLimit, parseRange, planLeagueLookup, readAfterMembership, requestedLeagueId } from "./tool-args.ts"

describe("parseArgs", () => {
  it("parses objects and turns everything else into {}", () => {
    assert.deepEqual(parseArgs('{"a":1}'), { a: 1 })
    for (const bad of ["", "nope", "null", "[1]", "5", '"s"', "{"]) assert.deepEqual(parseArgs(bad), {}, bad)
  })
})

describe("parseLimit", () => {
  const lim = (v: unknown) => parseLimit({ limit: v })
  it("defaults to 10 when missing or not a finite number", () => {
    assert.equal(parseLimit({}), 10)
    for (const v of ["5", null, NaN, Infinity, {}, [3]]) assert.equal(lim(v), 10)
  })
  it("clamps to 1-25 and truncates fractions", () => {
    assert.equal(lim(0), 1)
    assert.equal(lim(-4), 1)
    assert.equal(lim(1000), 25)
    assert.equal(lim(7.9), 7)
    assert.equal(lim(25), 25)
  })
})

describe("parseRange", () => {
  it("accepts known ranges and falls back to 1M", () => {
    for (const r of ["1W", "1M", "3M", "6M", "1Y", "ALL"]) assert.equal(parseRange({ range: r }), r)
    for (const r of ["1d", "all", "", null, 3, undefined]) assert.equal(parseRange({ range: r }), "1M")
  })
})

describe("parseBenchmark", () => {
  it("upper-cases known symbols and rejects the rest", () => {
    assert.equal(parseBenchmark({ symbol: "spy" }), "SPY")
    assert.equal(parseBenchmark({ symbol: "QQQ" }), "QQQ")
    for (const s of ["AAPL", "", " SPY", "SPY; DROP", null, 5, undefined]) assert.equal(parseBenchmark({ symbol: s }), null, String(s))
  })
})

describe("requestedLeagueId", () => {
  it("prefers the model's id, then the page's", () => {
    assert.equal(requestedLeagueId({ leagueId: "abc" }, "page"), "abc")
    assert.equal(requestedLeagueId({ leagueId: null }, "page"), "page")
    assert.equal(requestedLeagueId({ leagueId: "" }, "page"), "page")
    assert.equal(requestedLeagueId({ leagueId: 7 }, "page"), "page")
    assert.equal(requestedLeagueId({}, undefined), undefined)
  })
})

describe("planLeagueLookup", () => {
  const leagues = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}` }))
  it("none, single and overview", () => {
    assert.deepEqual(planLeagueLookup([]), { kind: "none" })
    assert.deepEqual(planLeagueLookup(leagues(1)), { kind: "single", id: "l0" })
    assert.deepEqual(planLeagueLookup(leagues(2)), { kind: "overview", ids: ["l0", "l1"], truncated: false })
  })
  it("caps the overview at 5 and flags truncation only past the cap", () => {
    assert.equal(MAX_LEAGUE_OVERVIEW, 5)
    const five = planLeagueLookup(leagues(5))
    assert.ok(five.kind === "overview" && five.ids.length === 5 && !five.truncated)
    const nine = planLeagueLookup(leagues(9))
    assert.ok(nine.kind === "overview" && nine.ids.length === 5 && nine.truncated)
  })
})

describe("readAfterMembership", () => {
  it("checks before reading", async () => {
    const order: string[] = []
    const out = await readAfterMembership(
      async () => void order.push("check"),
      async () => (order.push("read"), "data"),
    )
    assert.equal(out, "data")
    assert.deepEqual(order, ["check", "read"])
  })
  it("never reads when the check throws, so a non-member's id yields nothing", async () => {
    let read = false
    await assert.rejects(
      readAfterMembership(
        async () => {
          throw new Error("not a member")
        },
        async () => ((read = true), "leak"),
      ),
      /not a member/,
    )
    assert.equal(read, false)
  })
})
