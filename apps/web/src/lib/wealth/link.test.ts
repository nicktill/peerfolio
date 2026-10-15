import { test } from "node:test"
import assert from "node:assert/strict"
import { decodeWealthParams, encodeWealthParams, isWealthHref, wealthLabUrl } from "./link.ts"

const base = {
  startingValue: 25000,
  monthlyContribution: 1500,
  annualContributionGrowthPct: 3,
  years: 25,
  expectedAnnualReturnPct: 7,
  inflationPct: 2.5,
  targetValue: 1_000_000,
}

test("round-trips every field", () => {
  assert.deepEqual(decodeWealthParams(encodeWealthParams({ ...base, spread: 3 })), { ...base, spread: 3 })
})

test("omits a missing target and returns only what was present", () => {
  const q = encodeWealthParams({ ...base, targetValue: null })
  assert.ok(!q.includes("targetValue"))
  assert.equal(decodeWealthParams(q)?.targetValue, undefined)
})

test("clamps absurd values", () => {
  const d = decodeWealthParams("startingValue=99999999999&years=500&expectedAnnualReturnPct=99&inflationPct=31&spread=50")
  assert.deepEqual(d, { startingValue: 1e9, years: 100, expectedAnnualReturnPct: 30, inflationPct: 30, spread: 10 })
})

test("drops NaN, negatives, exponents, junk and unknown params", () => {
  assert.equal(decodeWealthParams("startingValue=NaN&monthlyContribution=-5&years=1e3&inflationPct=abc&targetValue=Infinity&x=1"), null)
  assert.deepEqual(decodeWealthParams("years=10&__proto__=1&constructor=2"), { years: 10 })
})

test("returns null for an empty or non-link query", () => {
  assert.equal(decodeWealthParams(""), null)
  assert.equal(decodeWealthParams("?utm=1"), null)
})

test("accepts a leading question mark", () => {
  assert.deepEqual(decodeWealthParams("?years=12"), { years: 12 })
})

test("builds a relative url and clamps on encode", () => {
  assert.match(wealthLabUrl({ ...base, years: 500 }), /^\/wealth\?.*years=100/)
})

test("only accepts same-origin wealth hrefs", () => {
  assert.ok(isWealthHref("/wealth?years=10"))
  assert.ok(isWealthHref("/wealth"))
  for (const bad of ["https://evil.com/wealth", "//evil.com", "/wealth//evil.com", "/wealthy", "javascript:alert(1)", "/wealth?a=1#x", "/wealth?a=\\b", "/dashboard", 5, null]) {
    assert.equal(isWealthHref(bad), false, String(bad))
  }
})
