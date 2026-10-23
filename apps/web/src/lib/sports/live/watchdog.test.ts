import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { judgeHealth } from "./watchdog.ts"

describe("live odds watchdog", () => {
  it("passes when ok, and when only some games lack a match", () => {
    assert.equal(judgeHealth(200, { status: "ok", reasons: [] }).ok, true)
    assert.equal(judgeHealth(200, { status: "degraded", reasons: ["1 live game(s) unmatched on the exchange"] }).ok, true)
  })
  it("fails when down, even without a reason", () => {
    assert.equal(judgeHealth(503, { status: "down", reasons: ["no live game has a fresh quote (2 live)"] }).ok, false)
    assert.equal(judgeHealth(503, { status: "down" }).ok, false)
  })
  it("fails on a silent or dead worker even when nothing is live (degraded, HTTP 200)", () => {
    assert.equal(judgeHealth(200, { status: "degraded", reasons: ["worker silent for 7200s (overdue 7100s)"] }).ok, false)
    assert.equal(judgeHealth(200, { status: "degraded", reasons: ["worker has never reported"] }).ok, false)
    assert.equal(judgeHealth(200, { status: "degraded", reasons: ["worker failed 4 cycles in a row"] }).ok, false)
  })
  it("fails closed on a refused secret, a non-JSON answer or a server error", () => {
    assert.equal(judgeHealth(401, null).ok, false)
    assert.equal(judgeHealth(200, "<html>").ok, false)
    assert.equal(judgeHealth(500, { status: "ok" }).ok, false)
  })
})
