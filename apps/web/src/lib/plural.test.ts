import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { plural } from "./plural.ts"

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    assert.equal(plural(1, "account"), "1 account")
    assert.equal(plural(1, "member"), "1 member")
  })

  it("uses the plural for zero and many", () => {
    assert.equal(plural(0, "day"), "0 days")
    assert.equal(plural(2, "day"), "2 days")
  })

  it("supports irregular plurals", () => {
    assert.equal(plural(1, "person", "people"), "1 person")
    assert.equal(plural(3, "person", "people"), "3 people")
  })
})
