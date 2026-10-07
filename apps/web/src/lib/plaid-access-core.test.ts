import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAdminEmail, productionBudgetSettings } from "./plaid-access-core.ts"

describe("brokerage admin and lifetime production budget settings", () => {
  it("grants no admin access unless a normalized database email is explicitly listed", () => {
    assert.equal(isAdminEmail("nick@example.com", undefined), false)
    assert.equal(isAdminEmail("nick@example.com", ""), false)
    assert.equal(isAdminEmail(" Nick@Example.com ", "other@example.com, NICK@example.com "), true)
    assert.equal(isAdminEmail("attacker@example.com", "nick@example.com"), false)
    assert.equal(isAdminEmail("", ""), false)
  })
  it("defaults to ten permanent attempts with zero historical offset", () => {
    assert.deepEqual(productionBudgetSettings({}), { limit: 10, previouslyUsed: 0 })
    assert.deepEqual(productionBudgetSettings({ PLAID_PRODUCTION_ITEM_LIMIT: "0", PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED: "3" }), { limit: 0, previouslyUsed: 3 })
    assert.deepEqual(productionBudgetSettings({ PLAID_PRODUCTION_ITEM_LIMIT: " 12 ", PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED: " 4 " }), { limit: 12, previouslyUsed: 4 })
  })
  it("rejects malformed budget configuration rather than disable the limit", () => {
    for (const value of ["-1", "1.5", "Infinity", "abc", "9007199254740992", "1e3"]) {
      assert.throws(() => productionBudgetSettings({ PLAID_PRODUCTION_ITEM_LIMIT: value }), /integer/)
      assert.throws(() => productionBudgetSettings({ PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED: value }), /integer/)
    }
  })
})
