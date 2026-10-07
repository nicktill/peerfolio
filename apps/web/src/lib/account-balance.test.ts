import assert from "node:assert/strict"
import { it } from "node:test"
import { accountBalance } from "./account-balance.ts"

it("preserves negative investment equity across portfolio and return calculations", () => {
  assert.equal(accountBalance(-250, "investment"), -250)
  assert.equal(accountBalance(1250, "investment"), 1250)
  assert.equal(accountBalance(-250, "credit"), 250)
})
