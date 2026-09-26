import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { categorizeAccount } from "./account-category.ts"

describe("categorizeAccount", () => {
  it("trusts Plaid's top-level type first", () => {
    assert.equal(categorizeAccount("investment", "401k"), "investment")
    assert.equal(categorizeAccount("credit", "credit card"), "credit")
    assert.equal(categorizeAccount("loan", "student"), "loan")
    assert.equal(categorizeAccount("depository", "checking"), "cash")
  })

  it("falls back to subtype when the type is unknown", () => {
    assert.equal(categorizeAccount(null, "roth ira"), "investment")
    assert.equal(categorizeAccount(undefined, "brokerage"), "investment")
    assert.equal(categorizeAccount("other", "money market"), "cash")
    assert.equal(categorizeAccount("other", "mortgage"), "loan")
  })

  it("counts retirement accounts as investments", () => {
    for (const subtype of ["401k", "403b", "ira", "roth", "sep", "pension", "529", "hsa"]) {
      assert.equal(categorizeAccount(null, subtype), "investment", `${subtype} should be an investment`)
    }
  })

  it("is case insensitive", () => {
    assert.equal(categorizeAccount("INVESTMENT", "401K"), "investment")
    assert.equal(categorizeAccount(null, "Roth IRA"), "investment")
  })

  it("defaults to other rather than guessing", () => {
    // Guessing wrong here would silently corrupt someone's net worth.
    assert.equal(categorizeAccount(null, null), "other")
    assert.equal(categorizeAccount("something-new", "unrecognised"), "other")
  })
})
