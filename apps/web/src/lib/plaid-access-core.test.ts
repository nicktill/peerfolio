import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { brokerageBlock, isAdminEmail, productionBudgetSettings, USER_LINK_LIMIT_NOTICE, USER_PRODUCTION_LINK_LIMIT } from "./plaid-access-core.ts"

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

it("caps Trial at ten without weakening smaller configured budgets", () => {
  assert.equal(productionBudgetSettings({ PLAID_ENV: "production", PLAID_PRODUCTION_ITEM_LIMIT: "100" }).limit, 10)
  assert.equal(productionBudgetSettings({ PLAID_ENV: "production", PLAID_CONNECTION_PROFILE: "trial", PLAID_PRODUCTION_ITEM_LIMIT: "3" }).limit, 3)
  assert.equal(productionBudgetSettings({ PLAID_ENV: "production", PLAID_CONNECTION_PROFILE: "paid", PLAID_PRODUCTION_ITEM_LIMIT: "100" }).limit, 10)
})

describe("brokerage access gating matrix", () => {
  const open = { paused: false, userBlocked: false, configured: true, production: true, userAttempts: 0, poolAvailable: 10 }
  const code = (over: Partial<typeof open>) => brokerageBlock({ ...open, ...over })?.code ?? null

  it("per-user cap is a single named constant defaulting to two, with the agreed notice", () => {
    assert.equal(USER_PRODUCTION_LINK_LIMIT, 2)
    assert.equal(USER_LINK_LIMIT_NOTICE, "Only 2 brokerage connections per account for now. More coming soon.")
  })
  it("allows every user who was never blocked, including with the legacy opt-in unset", () => {
    assert.equal(code({}), null)
    assert.equal(code({ userAttempts: USER_PRODUCTION_LINK_LIMIT - 1 }), null)
  })
  it("blocks a user at or over the cap, whatever the pool holds", () => {
    assert.equal(code({ userAttempts: 2 }), "user_limit")
    assert.equal(code({ userAttempts: 5 }), "user_limit")
    assert.equal(code({ userAttempts: 2, poolAvailable: 0 }), "user_limit")
  })
  it("shows full when the global pool is exhausted for a user with spare slots", () => {
    assert.equal(code({ poolAvailable: 0 }), "full")
    assert.equal(code({ userAttempts: 1, poolAvailable: 0 }), "full")
  })
  it("only applies cap and pool in production", () => {
    assert.equal(code({ production: false, userAttempts: 9, poolAvailable: 0 }), null)
  })
  it("kill switch, per-user block and missing config outrank the cap and the pool", () => {
    assert.equal(code({ paused: true, userBlocked: true, userAttempts: 9, poolAvailable: 0 }), "paused")
    assert.equal(code({ userBlocked: true, configured: false, userAttempts: 9 }), "off")
    assert.equal(code({ configured: false, userAttempts: 9, poolAvailable: 0 }), "unconfigured")
  })
  it("never refunds: the decision depends only on lifetime attempts, not on live connections", () => {
    // Disconnecting changes nothing here: the input is the attempt ledger count, which only grows.
    assert.equal(code({ userAttempts: 2 }), "user_limit")
  })
})
