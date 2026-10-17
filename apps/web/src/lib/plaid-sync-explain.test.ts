import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { explainRun, itemHealth, triggerLabel, type ExplainRun } from "./plaid-sync-explain.ts"

const run = (over: Partial<ExplainRun> = {}): ExplainRun => ({
  trigger: "cron", startedAt: "2026-10-14T18:47:55Z", durationMs: 4000, status: "ok", errorCode: null,
  accounts: 3, received: 20, kept: 20, skipped: {}, currencyAssumed: 0, missingTicker: 0, balanceWithoutHoldings: false, ...over,
})
const partial = (over: Partial<ExplainRun> = {}) => run({ status: "partial", balanceWithoutHoldings: true, accounts: 2, received: 1, kept: 1, durationMs: 14200, ...over })

describe("explainRun", () => {
  it("notes a pension with no positions on an otherwise clean run, but still warns for a real gap", () => {
    const e = explainRun(run({ accounts: 2, received: 1, kept: 1, positionlessAccounts: 1 }))
    assert.equal(e.severity, "ok")
    assert.match(e.detail, /1 pension account has no positions/)
    assert.equal(explainRun(partial()).severity, "warn")
  })
  it("calls a clean run clean", () => {
    const e = explainRun(run())
    assert.equal(e.severity, "ok")
    assert.match(e.detail, /20 holdings across 3 accounts/)
  })
  it("explains known failures with a next step", () => {
    const e = explainRun(run({ status: "failed", errorCode: "ITEM_LOGIN_REQUIRED" }))
    assert.equal(e.severity, "error")
    assert.match(e.action ?? "", /reconnect/i)
  })
  it("handles unknown error codes", () => {
    const e = explainRun(run({ status: "failed", errorCode: "WEIRD" }))
    assert.match(e.detail, /WEIRD/)
  })
  it("explains balance without holdings and notes slowness", () => {
    const e = explainRun(partial())
    assert.equal(e.severity, "warn")
    assert.match(e.detail, /slow/)
  })
  it("flags everything left out and partial skips", () => {
    assert.equal(explainRun(run({ received: 4, kept: 0, skipped: { "not in US dollars": 4 } })).severity, "warn")
    assert.equal(explainRun(run({ received: 4, kept: 3, skipped: { "not in US dollars": 1 } })).severity, "info")
  })
  it("labels triggers", () => {
    assert.equal(triggerLabel("webhook"), "Plaid webhook")
    assert.equal(triggerLabel("new"), "new")
  })
})

describe("itemHealth", () => {
  it("is healthy when the latest run is clean", () => assert.equal(itemHealth([run(), run()]).severity, "ok"))
  it("notes recovery after failures", () => {
    const h = itemHealth([run(), run({ status: "failed", errorCode: "REFRESH_FAILED" }), run({ status: "failed" })])
    assert.equal(h.severity, "ok")
    assert.match(h.detail, /Recovered after 2 earlier failures/)
  })
  it("calls out a repeating problem and the last clean sync", () => {
    const h = itemHealth([partial(), partial(), run({ startedAt: "2026-10-13T10:00:00Z" })])
    assert.equal(h.severity, "warn")
    assert.equal(h.badStreak, 2)
    assert.match(h.headline, /2 runs in a row/)
    assert.ok(h.lastCleanAt)
  })
  it("says so when there has never been a clean sync", () => {
    const h = itemHealth([partial(), partial()])
    assert.equal(h.lastCleanAt, null)
    assert.match(h.detail, /No clean sync/)
  })
  it("escalates to error when a failure is in the streak", () => {
    assert.equal(itemHealth([partial(), run({ status: "failed", errorCode: "X" })]).severity, "error")
  })
})
