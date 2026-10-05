import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { budgetFor, retryAfterSeconds } from "./provider-fetch.ts"

describe("budgetFor", () => {
  it("leaves headroom under each free allowance: burst plus a minute's refill stays below it", () => {
    const perMinuteAllowance = { finnhub: 60, alpaca: 200, massive: 5 } as const
    for (const [provider, allowance] of Object.entries(perMinuteAllowance)) {
      const { perMinute, burst } = budgetFor(provider as keyof typeof perMinuteAllowance, {})
      assert.ok(burst + perMinute < allowance, `${provider}: ${burst} + ${perMinute} must stay under ${allowance}`)
    }
    // Tiingo: 50 an hour and 1,000 a day.
    const tiingo = budgetFor("tiingo", {})
    assert.ok(tiingo.burst + tiingo.perMinute * 60 < 50)
    assert.ok(tiingo.burst + tiingo.perMinute * 60 * 24 < 1000)
  })

  it("can be overridden per provider, ignoring nonsense", () => {
    assert.deepEqual(budgetFor("finnhub", { FINNHUB_PER_MINUTE: "30", FINNHUB_BURST: "3" }), { perMinute: 30, burst: 3 })
    assert.deepEqual(budgetFor("finnhub", { FINNHUB_PER_MINUTE: "-1", FINNHUB_BURST: "abc" }), budgetFor("finnhub", {}))
  })
})

describe("retryAfterSeconds", () => {
  const now = Date.parse("2026-10-05T23:00:00Z")

  it("reads seconds", () => {
    assert.equal(retryAfterSeconds("30", now), 30)
  })

  it("reads an HTTP date", () => {
    assert.equal(retryAfterSeconds("Mon, 05 Oct 2026 23:01:30 GMT", now), 90)
  })

  it("waits as long as the provider asks, however long", () => {
    assert.equal(retryAfterSeconds("86400", now), 86400)
  })

  it("waits a minute when the header is missing or unreadable, and never less than a second", () => {
    assert.equal(retryAfterSeconds(null, now), 60)
    assert.equal(retryAfterSeconds("soon", now), 60)
    assert.equal(retryAfterSeconds("0", now), 1)
  })
})
