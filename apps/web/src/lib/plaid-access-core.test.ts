import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { brokerageBlock, choosePool, firstAvailablePool, poolBudgets, productionPools, totalCapacity, isAdminEmail, productionBudgetSettings, USER_LINK_LIMIT_NOTICE, USER_PRODUCTION_LINK_LIMIT } from "./plaid-access-core.ts"

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

describe("two Trial pools", () => {
  const prod = { PLAID_ENV: "production" }
  const ledger = (one: number, two = 0) => ({ 1: { attempts: one, reserved: 0, uncertain: 0 }, 2: { attempts: two, reserved: 0, uncertain: 0 } })

  it("is exactly today's single pool of ten when pool-2 credentials are missing", () => {
    const pools = productionPools(prod, false)
    assert.deepEqual(pools, [{ pool: 1, profile: "trial", limit: 10, previouslyUsed: 0 }])
    const budgets = poolBudgets(pools, ledger(3, 9))
    assert.equal(totalCapacity(budgets).limit, 10)
    assert.equal(totalCapacity(budgets).used, 3)
  })
  it("adds a second pool of ten only in production with credentials, and sums capacity", () => {
    assert.equal(productionPools({ PLAID_ENV: "sandbox" }, true).length, 1)
    const budgets = poolBudgets(productionPools(prod, true), ledger(4, 1))
    assert.equal(budgets.length, 2)
    assert.deepEqual(totalCapacity(budgets), { limit: 20, used: 5, reserved: 0, uncertain: 0, available: 15, previouslyUsed: 0, attempts: 5 })
  })
  it("hard-caps every pool at ten whatever the env asks", () => {
    const pools = productionPools({ ...prod, PLAID_PRODUCTION_ITEM_LIMIT: "50", PLAID_TRIAL2_ITEM_LIMIT: "50" }, true)
    assert.deepEqual(pools.map((p) => p.limit), [10, 10])
    assert.equal(productionPools({ ...prod, PLAID_TRIAL2_ITEM_LIMIT: "3" }, true)[1]!.limit, 3)
    assert.throws(() => productionPools({ ...prod, PLAID_TRIAL2_ITEM_LIMIT: "x" }, true), /integer/)
  })
  it("keeps PLAID_PRODUCTION_* semantics for pool 1 and applies pool 2 offsets separately", () => {
    const pools = productionPools({ ...prod, PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED: "4", PLAID_TRIAL2_ITEMS_PREVIOUSLY_USED: "2" }, true)
    const budgets = poolBudgets(pools, ledger(1, 1))
    assert.deepEqual(budgets.map((b) => b.available), [5, 7])
  })
  it("fails over to pool 2 only after pool 1's ten are used", () => {
    const budgets = (one: number, two = 0) => poolBudgets(productionPools(prod, true), ledger(one, two))
    assert.equal(firstAvailablePool(budgets(9))?.pool, 1)
    assert.equal(firstAvailablePool(budgets(10))?.pool, 2)
    assert.equal(firstAvailablePool(budgets(10, 10)), null)
  })
  it("chooses the requested pool only when it is the open one", () => {
    const at = (one: number, two = 0) => poolBudgets(productionPools(prod, true), ledger(one, two))
    assert.deepEqual(choosePool(at(9), 1).ok, true)
    assert.deepEqual(choosePool(at(9), 2), { ok: false, reason: "invalid" })
    assert.deepEqual(choosePool(at(10), 1), { ok: false, reason: "pool_filled" })
    const second = choosePool(at(10), 2)
    assert.ok(second.ok && second.budget.profile === "trial2")
    assert.deepEqual(choosePool(at(10, 10), 2), { ok: false, reason: "full" })
    assert.deepEqual(choosePool(at(0), 3), { ok: false, reason: "invalid" })
  })
  it("with one pool configured a pool-2 request is invalid", () => {
    const one = poolBudgets(productionPools(prod, false), ledger(2))
    assert.deepEqual(choosePool(one, 2), { ok: false, reason: "invalid" })
    assert.deepEqual(choosePool(poolBudgets(productionPools(prod, false), ledger(10)), 1), { ok: false, reason: "full" })
  })
})
