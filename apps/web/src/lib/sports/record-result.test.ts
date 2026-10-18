import assert from "node:assert/strict"
import { test } from "node:test"
import { recordResult } from "./record-result.ts"

test("cash-out records classify profit and break-even as won, loss as lost", () => {
  for (const [payout, result] of [[374, "won"], [200, "won"], [150, "lost"], [0, "lost"]] as const) {
    const ticket = { status: "cashed_out", stake: 200, payout }
    assert.equal(recordResult(ticket), result)
    assert.equal(ticket.status, "cashed_out", "stored/display status is preserved")
  }
})

test("missing cash-out payouts and other ticket statuses are not guessed", () => {
  assert.equal(recordResult({ status: "cashed_out", stake: 200, payout: null }), "cashed_out")
  for (const status of ["open", "won", "lost", "push", "void"]) {
    assert.equal(recordResult({ status, stake: 200, payout: 200 }), status)
  }
})
