import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { describeMovement, rankMovement } from "./rank-change.ts"

describe("rankMovement", () => {
  it("is positive when you climbed and negative when you fell", () => {
    assert.equal(rankMovement(4, 2), 2)
    assert.equal(rankMovement(1, 3), -2)
  })

  it("is null when nothing changed or there is nothing to compare against", () => {
    assert.equal(rankMovement(2, 2), null)
    assert.equal(rankMovement(null, 2), null)
    assert.equal(rankMovement(undefined, 2), null)
    assert.equal(rankMovement(0, 2), null)
    assert.equal(rankMovement(Number.NaN, 2), null)
  })
})

describe("describeMovement", () => {
  it("words the change", () => {
    assert.equal(describeMovement(2), "Up 2")
    assert.equal(describeMovement(-1), "Down 1")
    assert.equal(describeMovement(null), null)
  })
})
