import { test } from "node:test"
import assert from "node:assert/strict"
import { nextRecovery } from "../src/recovery.ts"
test("supervisor continues beyond six platform retries with capped backoff and visible errors", () => {
  let failures = 0,
    now = 1_000,
    lastDelay = 0
  for (let i = 0; i < 20; i++) {
    const result = nextRecovery(
      failures,
      now,
      new Error("upstream unavailable"),
    )
    const delay = result.nextDue - now
    assert.ok(delay >= 30_000 && delay <= 15 * 60_000 && delay >= lastDelay)
    assert.equal(result.failures, i + 1)
    assert.match(result.error, /upstream unavailable/)
    failures = result.failures
    now = result.nextDue
    lastDelay = delay
  }
})
