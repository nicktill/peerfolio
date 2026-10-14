import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildSyncRun, countMissingTicker, emptyMetrics, plaidRequestId, runConcern, runStatus } from "./plaid-sync-runs-core.ts"

const base = { itemId: "i", userId: "u", trigger: "cron" as const, startedAt: new Date("2026-10-14T04:44:12Z"), finishedAt: new Date("2026-10-14T04:44:15.5Z") }

describe("sync run records", () => {
  it("ranks failed over partial over ok", () => {
    assert.equal(runStatus(false, { balanceWithoutHoldings: false }), "ok")
    assert.equal(runStatus(false, { balanceWithoutHoldings: true }), "partial")
    assert.equal(runStatus(true, { balanceWithoutHoldings: true }), "failed")
  })
  it("records counts and codes only", () => {
    const metrics = { ...emptyMetrics(), accounts: 3, holdingsReceived: 5, holdingsKept: 3, skipped: { "not in US dollars": 2 }, requestId: "req-1" }
    const row = buildSyncRun({ ...base, failed: false, metrics })
    assert.equal(row.durationMs, 3500)
    assert.equal(row.status, "ok")
    assert.equal(row.errorCode, null)
    assert.deepEqual(row.holdingsSkipped, { "not in US dollars": 2 })
    assert.deepEqual(Object.keys(row).sort(), ["accountsReceived", "balanceWithoutHoldings", "currencyAssumed", "durationMs", "errorCode", "holdingsKept", "holdingsReceived", "holdingsSkipped", "itemId", "requestId", "securitiesMissingTicker", "startedAt", "status", "trigger", "userId"])
  })
  it("keeps the error code only for failed runs and defaults it", () => {
    assert.equal(buildSyncRun({ ...base, failed: true, metrics: emptyMetrics() }).errorCode, "SYNC_FAILED")
    assert.equal(buildSyncRun({ ...base, failed: true, errorCode: "ITEM_LOGIN_REQUIRED", metrics: emptyMetrics() }).errorCode, "ITEM_LOGIN_REQUIRED")
    assert.equal(buildSyncRun({ ...base, failed: false, errorCode: "IGNORED", metrics: emptyMetrics() }).errorCode, null)
  })
  it("flags the runs worth a look", () => {
    const run = (over: object) => ({ ...buildSyncRun({ ...base, failed: false, metrics: emptyMetrics() }), ...over })
    assert.equal(runConcern(run({})), null)
    assert.equal(runConcern(run({ status: "failed" })), "Sync failed")
    assert.equal(runConcern(run({ balanceWithoutHoldings: true })), "Balance but no holdings")
    assert.equal(runConcern(run({ holdingsReceived: 4, holdingsKept: 0, holdingsSkipped: { x: 4 } })), "Every holding line was left out")
    assert.equal(runConcern(run({ holdingsReceived: 4, holdingsKept: 3, holdingsSkipped: { x: 1 } })), "Some lines left out")
    assert.match(runConcern(run({ currencyAssumed: 2 }))!, /currency/i)
  })
  it("counts securities without a ticker and finds the Plaid request id", () => {
    assert.equal(countMissingTicker([{ ticker_symbol: "AAPL" }, { ticker_symbol: null }, { ticker_symbol: " " }, {}]), 3)
    assert.equal(plaidRequestId({ data: { request_id: "a" } }), "a")
    assert.equal(plaidRequestId({ response: { data: { request_id: "b" } } }), "b")
    assert.equal(plaidRequestId(new Error("x")), null)
  })
})
