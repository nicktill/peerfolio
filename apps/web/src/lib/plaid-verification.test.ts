import assert from "node:assert/strict"
import { it } from "node:test"
import { hasVerifiedAccounts } from "./plaid-verification.ts"

const now = Date.parse("2026-10-07T12:00:00Z")
const accounts = [{ source: "plaid", itemId: "item" }]
const item = { id: "item", status: "active", lastSyncedAt: "2026-10-06T22:30:00Z" }

it("keeps last night's imported balances verified until the next nightly refresh", () => {
  assert.equal(hasVerifiedAccounts(accounts, [item], now), true)
})
it("excludes empty, manual, missing, failed, disconnected, invalid and stale data", () => {
  assert.equal(hasVerifiedAccounts([], [item], now), false)
  assert.equal(hasVerifiedAccounts([{ source: "manual", itemId: null }], [item], now), false)
  assert.equal(hasVerifiedAccounts(accounts, [], now), false)
  for (const status of ["error", "needs_reauth", "disconnected"]) assert.equal(hasVerifiedAccounts(accounts, [{ ...item, status }], now), false)
  for (const lastSyncedAt of [null, "bad-date", "2026-10-05T11:59:00Z", "2026-10-08T12:00:00Z"]) {
    assert.equal(hasVerifiedAccounts(accounts, [{ ...item, lastSyncedAt }], now), false)
  }
})
it("requires every contributing account's connection to be healthy", () => {
  assert.equal(hasVerifiedAccounts([...accounts, { source: "plaid", itemId: "missing" }], [item], now), false)
})
