import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { etTime, sourceInitials, sourceLogo } from "./source-logos.ts"

describe("source logos", () => {
  it("knows the publishers it has marks for", () => {
    assert.equal(sourceLogo("CNBC"), "/sources/cnbc.png")
    assert.equal(sourceLogo("MarketWatch"), "/sources/marketwatch.png")
    assert.equal(sourceLogo("Nasdaq"), null)
  })
  it("makes initials for the rest", () => {
    assert.equal(sourceInitials("Yahoo Finance"), "YF")
    assert.equal(sourceInitials("Nasdaq"), "NA")
  })
  it("formats times in New York and tolerates missing ones", () => {
    assert.equal(etTime("2026-10-14T18:30:00Z"), "2:30 PM ET")
    assert.equal(etTime(undefined), null)
    assert.equal(etTime("nope"), null)
  })
})
