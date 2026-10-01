import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildAccountEvent } from "./account-events-core.ts"

describe("buildAccountEvent", () => {
  it("records money as fixed-point strings and keeps the account's name", () => {
    const row = buildAccountEvent("u1", 100000, 35921.17, { action: "account_updated", accountId: "a1", accountName: "401k" })
    assert.equal(row.investableBefore, "100000.0000")
    assert.equal(row.investableAfter, "35921.1700")
    assert.equal(row.accountName, "401k")
    assert.equal(row.action, "account_updated")
  })

  it("keeps a history of a balance dropping to zero, with before and after", () => {
    const row = buildAccountEvent("u1", 70000, 0, {
      action: "position_removed",
      accountId: "a1",
      detail: { symbol: "FXAIX", quantity: 10, value: 70000 },
    })
    assert.equal(row.investableBefore, "70000.0000")
    assert.equal(row.investableAfter, "0.0000")
    assert.deepEqual(row.detail, { symbol: "FXAIX", quantity: 10, value: 70000 })
  })

  it("drops undefined detail values so JSON storage stays clean", () => {
    const row = buildAccountEvent("u1", 0, 10, { action: "position_set", accountId: "a1", detail: { symbol: "VOO", avgCost: undefined } })
    assert.deepEqual(row.detail, { symbol: "VOO" })
    assert.equal(row.accountName, null)
  })

  it("never writes NaN into a numeric column", () => {
    const row = buildAccountEvent("u1", Number.NaN, Number.POSITIVE_INFINITY, { action: "account_created", accountId: "a1" })
    assert.equal(row.investableBefore, "0.0000")
    assert.equal(row.investableAfter, "0.0000")
  })
})
