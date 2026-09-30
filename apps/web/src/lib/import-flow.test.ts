import test from "node:test"
import assert from "node:assert/strict"
import { hasMultipleImportAccounts, duplicateImportDestination } from "./import-flow.ts"

test("keeps unlabeled holdings separate from a named account", () => {
  assert.equal(hasMultipleImportAccounts([{ account: "IRA" }, { account: null }]), true)
  assert.equal(hasMultipleImportAccounts([{ account: "IRA" }, { account: "IRA" }]), false)
  assert.equal(hasMultipleImportAccounts([]), false)
})

test("prevents two source accounts overwriting the same destination", () => {
  assert.equal(duplicateImportDestination(["IRA", "Brokerage"], { IRA: "account-1", Brokerage: "account-1" }), true)
  assert.equal(duplicateImportDestination(["IRA", "Brokerage"], { IRA: "account-1", Brokerage: "account-2" }), false)
  assert.equal(duplicateImportDestination(["IRA", "Brokerage"], {}), false)
  assert.equal(duplicateImportDestination(["IRA"], { IRA: "account-1", Brokerage: "account-1" }), false)
})
