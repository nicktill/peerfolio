import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { cleanName, matchScore, normalizeQuery, rankSuggestions } from "./ticker-search.ts"

describe("cleanName", () => {
  it("drops share-class boilerplate", () => {
    assert.equal(cleanName("Applied Digital Corporation Common Stock"), "Applied Digital Corporation")
    assert.equal(cleanName("Alphabet Inc. Class A Common Stock"), "Alphabet Inc.")
    assert.equal(cleanName("SPDR S&P 500 ETF Trust"), "SPDR S&P 500 ETF Trust")
    assert.equal(cleanName(null), null)
  })
})

describe("normalizeQuery", () => {
  it("keeps ticker and name characters only", () => {
    assert.equal(normalizeQuery("  brk.b "), "brk.b")
    assert.equal(normalizeQuery("a%p_p<l>e"), "apple")
  })
})

describe("matchScore", () => {
  const apld = { symbol: "APLD", name: "Applied Digital Corporation" }
  it("ranks exact, then symbol prefix, then name", () => {
    assert.equal(matchScore("APLD", apld), 0)
    assert.equal(matchScore("ap", apld), 1)
    assert.equal(matchScore("applied", apld), 2)
    assert.equal(matchScore("digital", apld), 3)
    assert.equal(matchScore("gital", apld), 4)
  })
  it("doesn't match short fragments mid-word, or nothing at all", () => {
    assert.equal(matchScore("it", apld), null)
    assert.equal(matchScore("", apld), null)
    assert.equal(matchScore("TSLA", apld), null)
  })
})

describe("rankSuggestions", () => {
  it("puts symbol matches first and shorter symbols ahead", () => {
    const result = rankSuggestions("AP", [
      [
        { symbol: "APPS", name: "Digital Turbine" },
        { symbol: "AAPL", name: "Apple Inc. Common Stock" },
        { symbol: "APLD", name: "Applied Digital Corporation Common Stock" },
        { symbol: "APP", name: "AppLovin Corporation" },
      ],
    ])
    assert.deepEqual(result.map((s) => s.symbol), ["APP", "APLD", "APPS", "AAPL"])
    assert.equal(result[3].name, "Apple Inc.")
  })

  it("dedupes across sources, keeping the first and filling a missing name", () => {
    const result = rankSuggestions("nvd", [[{ symbol: "nvda", name: null }], [{ symbol: "NVDA", name: "NVIDIA Corp" }, { symbol: "NVDL", name: "x" }]])
    assert.deepEqual(result, [{ symbol: "NVDA", name: "NVIDIA Corp" }, { symbol: "NVDL", name: "x" }])
  })

  it("respects the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ symbol: `A${i}`, name: null }))
    assert.equal(rankSuggestions("A", [many], 6).length, 6)
  })
})
