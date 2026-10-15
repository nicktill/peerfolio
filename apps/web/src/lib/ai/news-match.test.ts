import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { matchHoldings, nameKey } from "./news-match.ts"

const held = [
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "ALL", name: "Allstate Corp" },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF" },
]

describe("nameKey", () => {
  it("strips legal suffixes and drops short names", () => {
    assert.equal(nameKey("Apple Inc."), "apple")
    assert.equal(nameKey("Meta Platforms, Inc. Class A"), "meta platforms")
    assert.equal(nameKey("Ford Co"), null)
    assert.equal(nameKey(null), null)
  })
})

describe("matchHoldings", () => {
  it("matches a ticker as a whole word", () => {
    assert.deepEqual(matchHoldings({ title: "AAPL jumps after earnings" }, held), ["AAPL"])
    assert.deepEqual(matchHoldings({ title: "Stocks: $AAPL and others" }, held), ["AAPL"])
  })
  it("matches a company name case-insensitively", () => {
    assert.deepEqual(matchHoldings({ title: "Apple unveils new iPhone" }, held), ["AAPL"])
  })
  it("does not match a ticker inside another word or in lower case", () => {
    assert.deepEqual(matchHoldings({ title: "Markets rally as all sectors rise" }, held), [])
    assert.deepEqual(matchHoldings({ title: "AAPLX fund launches" }, held), [])
  })
  it("looks in the summary too and lists each holding once", () => {
    assert.deepEqual(matchHoldings({ title: "Tech earnings", summary: "Apple and AAPL peers report" }, held), ["AAPL"])
  })
})
