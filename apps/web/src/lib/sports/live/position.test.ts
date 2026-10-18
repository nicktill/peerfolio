import { test } from "node:test"
import assert from "node:assert/strict"
import { livePosition, toWin } from "./position.ts"
import type { LiveView } from "./view.ts"

const view = (over: Partial<LiveView> = {}, odds: Partial<Extract<LiveView["odds"], { status: "ok" }>> = {}): LiveView => ({
  eventId: "e", status: "live", score: { home: 1, away: 0 }, period: null, clock: null, stateAsOf: null, stateFreshness: null, serverTime: "",
  odds: { status: "ok", homeProb: 0.6, awayProb: 0.4, drawProb: null, source: "polymarket", asOf: "", ageMs: 2000, freshness: "live", confidence: "high", mismatch: null, ...odds },
  ...over,
})
const pick = { stake: 1000, totalReturn: 1377, kind: "moneyline", selection: "home" }

test("to win is profit", () => assert.equal(toWin(pick), 377))
test("value is total return times side probability", () => {
  const p = livePosition(pick, view(), 0)!
  assert.ok(Math.abs(p.value - 826.2) < 1e-9)
  assert.ok(Math.abs(p.pl - -173.8) < 1e-9)
})
test("away side uses away probability", () => {
  const p = livePosition({ ...pick, selection: "away" }, view(), 0)!
  assert.ok(Math.abs(p.value - 550.8) < 1e-9)
})
test("three-way: draw uses the draw probability", () => {
  const v = view({}, { homeProb: 0.5, awayProb: 0.2, drawProb: 0.3 })
  assert.ok(Math.abs(livePosition({ ...pick, selection: "draw" }, v, 0)!.value - 413.1) < 1e-9)
  assert.equal(livePosition({ ...pick, selection: "draw" }, view(), 0), null)
})
test("hidden when stale, paused, not live, or not a moneyline", () => {
  assert.equal(livePosition(pick, view({}, { ageMs: 130_000 }), 0), null)
  assert.equal(livePosition(pick, view({}, { ageMs: 100_000 }), 40_000), null)
  assert.equal(livePosition(pick, view({ odds: { status: "paused", reason: "stale", lastAsOf: null } }), 0), null)
  assert.equal(livePosition(pick, view({ status: "final" }), 0), null)
  assert.equal(livePosition(pick, null, 0), null)
  assert.equal(livePosition({ ...pick, kind: "spread" }, view(), 0), null)
})
