import assert from "node:assert/strict"
import test from "node:test"
import { isEmptyLinkedAccount } from "./empty-account.ts"

const base = { source: "plaid", balance: 0, positions: [] } as const

test("a linked $0 account with no holdings is empty", () => {
  assert.equal(isEmptyLinkedAccount(base), true)
})

test("balance, positions, a holding count or a pending load make it non-empty", () => {
  assert.equal(isEmptyLinkedAccount({ ...base, balance: 5 }), false)
  assert.equal(isEmptyLinkedAccount({ ...base, positions: [{}] }), false)
  assert.equal(isEmptyLinkedAccount({ ...base, holdingCount: 2 }), false)
  assert.equal(isEmptyLinkedAccount({ ...base, holdingsPending: true }), false)
})

test("manual accounts are never hidden", () => {
  assert.equal(isEmptyLinkedAccount({ ...base, source: "manual" }), false)
})
