import { test } from "node:test"
import assert from "node:assert/strict"
import { livePosition, toWin } from "./position.ts"
import { liveCashout } from "../cashout.ts"
import type { LiveView } from "./view.ts"

const view = (over: Partial<LiveView> = {}, odds: Partial<Extract<LiveView["odds"], { status: "ok" }>> = {}): LiveView => ({
  eventId: "e", status: "live", score: { home: 1, away: 0 }, period: null, clock: null, stateAsOf: null, stateFreshness: null, serverTime: "",
  odds: { status: "ok", homeProb: 0.6, awayProb: 0.4, drawProb: null, source: "polymarket", asOf: "", ageMs: 2000, freshness: "live", confidence: "high", mismatch: null, ...odds },
  ...over,
})
const pick = { stake: 1000, totalReturn: 1377, kind: "moneyline", selection: "home" }

test("to win is profit", () => assert.equal(toWin(pick), 377))
test("value is total return times side probability, in whole credits", () => {
  const p = livePosition(pick, view(), 0)!
  assert.equal(p.value, 827)
  assert.equal(p.pl, -173)
})
test("the estimate is exactly the cash-out quote (same inputs, same rounding)", () => {
  for (const [stake, totalReturn, prob] of [[750, 1377, 0.4153], [1000, 1377, 0.6], [333, 1000, 0.7777], [10, 19, 0.5], [500, 500, 0.999]] as const) {
    const v = view({}, { homeProb: prob, awayProb: 1 - prob })
    const p = livePosition({ stake, totalReturn, kind: "moneyline", selection: "home" }, v, 0)!
    const q = liveCashout({ stake, totalReturn, kind: "moneyline", selection: "home", point: null }, v, 0)
    assert.equal(p.value, q?.value ?? 0)
  }
})
test("away side uses away probability", () => {
  const p = livePosition({ ...pick, selection: "away" }, view(), 0)!
  assert.ok(Math.abs(p.value - 551) < 1e-9)
})
test("three-way: draw uses the draw probability", () => {
  const v = view({}, { homeProb: 0.5, awayProb: 0.2, drawProb: 0.3 })
  assert.ok(Math.abs(livePosition({ ...pick, selection: "draw" }, v, 0)!.value - 414) < 1e-9)
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

test("a started game the score feed does not know still gets a value from a fresh exchange quote", () => {
  const v = view()
  assert.equal(livePosition(pick, { ...v, status: "unknown" } as typeof v, 0), null)
  assert.ok(livePosition(pick, { ...v, status: "unknown" } as typeof v, 0, true))
  assert.ok(livePosition(pick, { ...v, status: "pre" } as typeof v, 0, true))
  assert.equal(livePosition(pick, { ...v, status: "final" } as typeof v, 0, true), null)
})
