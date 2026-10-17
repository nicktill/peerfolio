import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MANUAL_RUN_COOLDOWN_MS, REFRESH_COOLDOWN_MS, buildSyncRun, isItemRowId, manualRunGate, summarizeRun, countMissingTicker, emptyMetrics, plaidRequestId, runConcern, runStatus } from "./plaid-sync-runs-core.ts"

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
    assert.deepEqual(Object.keys(row).sort(), ["accountsReceived", "balanceWithoutHoldings", "currencyAssumed", "durationMs", "errorCode", "holdingsKept", "holdingsReceived", "holdingsSkipped", "itemId", "positionlessAccounts", "requestId", "securitiesMissingTicker", "startedAt", "status", "trigger", "userId"])
  })
  it("records a pension-only gap as an ok run with a count, not a concern", () => {
    const row = buildSyncRun({ ...base, failed: false, metrics: { ...emptyMetrics(), accounts: 2, holdingsReceived: 1, holdingsKept: 1, positionlessAccounts: 1 } })
    assert.equal(row.status, "ok")
    assert.equal(row.positionlessAccounts, 1)
    assert.equal(runConcern(row), null)
    assert.equal(summarizeRun(row).positionless, 1)
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

describe("admin on-demand sync", () => {
  const now = new Date("2026-10-14T12:00:00Z")
  const ago = (ms: number) => new Date(now.getTime() - ms)
  it("allows a first run and a run after the cooldown", () => {
    assert.deepEqual(manualRunGate({ lastFinishedAt: null, now, inFlight: false }), { ok: true })
    assert.deepEqual(manualRunGate({ lastFinishedAt: ago(MANUAL_RUN_COOLDOWN_MS), now, inFlight: false }), { ok: true })
  })
  it("blocks within a minute of the last run and says how long to wait", () => {
    assert.deepEqual(manualRunGate({ lastFinishedAt: ago(20_000), now, inFlight: false }), { ok: false, reason: "cooldown", retryAfterSec: 40 })
    assert.deepEqual(manualRunGate({ lastFinishedAt: ago(0), now, inFlight: false }), { ok: false, reason: "cooldown", retryAfterSec: 60 })
  })
  it("blocks a second run while one is in flight", () => {
    const gate = manualRunGate({ lastFinishedAt: null, now, inFlight: true })
    assert.equal(gate.ok, false)
    assert.equal(!gate.ok && gate.reason, "in_flight")
  })
  it("holds Plaid refresh requests to one per ten minutes", () => {
    const gate = (agoMs: number | null) => manualRunGate({ lastFinishedAt: agoMs === null ? null : ago(agoMs), now, inFlight: false, cooldownMs: REFRESH_COOLDOWN_MS })
    assert.deepEqual(gate(null), { ok: true })
    assert.deepEqual(gate(5 * 60_000), { ok: false, reason: "cooldown", retryAfterSec: 300 })
    assert.deepEqual(gate(REFRESH_COOLDOWN_MS), { ok: true })
    assert.equal(manualRunGate({ lastFinishedAt: null, now, inFlight: true, cooldownMs: REFRESH_COOLDOWN_MS }).ok, false)
  })
  it("accepts only full item row ids", () => {
    assert.equal(isItemRowId("0b9a2d3e-5c1f-4a77-9e0d-1f2a3b4c5d6e"), true)
    for (const bad of ["0b9a2d3e", "", "0b9a2d3e-5c1f-4a77-9e0d-1f2a3b4c5d6e; drop", null, 5, undefined]) assert.equal(isItemRowId(bad), false)
  })
  it("summarizes a run without ids or tokens", () => {
    const row = buildSyncRun({ ...base, failed: false, metrics: { ...emptyMetrics(), accounts: 2, holdingsReceived: 4, holdingsKept: 3, skipped: { x: 1 }, balanceWithoutHoldings: true, requestId: "r" } })
    const summary = summarizeRun(row)
    assert.equal(summary.awaiting, true)
    assert.deepEqual([summary.received, summary.kept, summary.skipped], [4, 3, { x: 1 }])
    assert.equal("itemId" in summary || "userId" in summary, false)
  })
})
