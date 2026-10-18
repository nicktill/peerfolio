import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { LIMITS, syncLimitFromEnv } from "./rate-limit.ts"

describe("Plaid sync limit switch", () => {
  it("is off when unset, 0, negative or not a whole number", () => {
    for (const v of [undefined, "", "0", "-3", "abc", "2.5"]) assert.equal(syncLimitFromEnv({ PLAID_SYNC_LIMIT_PER_MIN: v }), null)
    assert.equal(syncLimitFromEnv({}), null)
  })
  it("is on with a positive whole number, which is the per-minute cap", () => {
    assert.equal(syncLimitFromEnv({ PLAID_SYNC_LIMIT_PER_MIN: "6" }), 6)
    assert.equal(syncLimitFromEnv({ PLAID_SYNC_LIMIT_PER_MIN: "20" }), 20)
  })
  it("uses a one-minute window", () => {
    assert.equal(LIMITS.sync.windowMs, 60_000)
  })
})
