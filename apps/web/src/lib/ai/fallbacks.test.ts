import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { fallbackFollowUps } from "./fallbacks.ts"

describe("fallbackFollowUps", () => {
  it("gives three page-specific questions", () => {
    const q = fallbackFollowUps("leagues", "something else")
    assert.equal(q.length, 3)
    assert.ok(q.some((x) => /leader/i.test(x)))
  })
  it("never repeats the question just asked, whatever its punctuation or case", () => {
    const q = fallbackFollowUps("portfolio", "what are my biggest risks")
    assert.ok(!q.includes("What are my biggest risks?"))
    assert.equal(q.length, 3)
  })
  it("covers every page", () => {
    for (const page of ["portfolio", "leagues", "fantasy", "news", "board", "wealth", "other"] as const) assert.ok(fallbackFollowUps(page, "").length >= 2, page)
  })
})
