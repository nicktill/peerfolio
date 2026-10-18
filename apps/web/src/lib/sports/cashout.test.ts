import { test } from "node:test"
import assert from "node:assert/strict"
import { liveCashout, pregameCashout, settleCashout, CashoutRejected } from "./cashout.ts"
import type { LiveView } from "./live/view.ts"

const pick = { stake: 1000, totalReturn: 2000, kind: "moneyline", selection: "home", point: null }
const view = (over: Partial<LiveView> = {}, odds: Record<string, unknown> = {}): LiveView => ({
  eventId: "e", status: "live", score: { home: 1, away: 0 }, period: null, clock: null, stateAsOf: null, stateFreshness: null, serverTime: "",
  odds: { status: "ok", homeProb: 0.6, awayProb: 0.4, drawProb: null, source: "polymarket", asOf: "", ageMs: 2000, freshness: "live", confidence: "high", mismatch: null, ...odds } as LiveView["odds"],
  ...over,
})

test("pregame: an unchanged line returns the stake less the fee", () => {
  assert.equal(pregameCashout(pick, { price: 100, point: null }, true)?.value, 950)
})
test("pregame: a shorter price is worth more", () => {
  assert.equal(pregameCashout(pick, { price: -200, point: null }, true)!.value, Math.floor(2000 * (2 / 3) * 0.95))
})
test("pregame: closed window, missing line or moved point offers nothing", () => {
  assert.equal(pregameCashout(pick, { price: 100, point: null }, false), null)
  assert.equal(pregameCashout(pick, null, true), null)
  assert.equal(pregameCashout({ ...pick, kind: "spread", point: -3 }, { price: -110, point: -3.5 }, true), null)
})
test("live: total return times probability less the fee", () => {
  assert.equal(liveCashout(pick, view())!.value, Math.floor(2000 * 0.6 * 0.95))
})
test("live: never above the total return", () => {
  assert.equal(liveCashout(pick, view({}, { homeProb: 1 }))!.value, 1900)
})
test("live: stale, low confidence, disagreeing, not live or not a moneyline offers nothing", () => {
  assert.equal(liveCashout(pick, view({}, { ageMs: 40_000 })), null)
  assert.equal(liveCashout(pick, view({}, { confidence: "low" })), null)
  assert.equal(liveCashout(pick, view({}, { mismatch: true })), null)
  assert.equal(liveCashout(pick, view({ status: "pre" })), null)
  assert.equal(liveCashout({ ...pick, kind: "spread" }, view()), null)
  assert.equal(liveCashout(pick, null), null)
})
test("settle: pays the agreed price when the quote held or rose, the lower price within tolerance", () => {
  assert.equal(settleCashout(1000, 1000), 1000)
  assert.equal(settleCashout(1000, 1200), 1000)
  assert.equal(settleCashout(1000, 995), 995)
})
test("settle: refuses a price that fell past tolerance or an invalid expectation", () => {
  assert.throws(() => settleCashout(1000, 900), (e) => e instanceof CashoutRejected && e.code === "moved")
  assert.throws(() => settleCashout(0, 900), (e) => e instanceof CashoutRejected && e.code === "unavailable")
})
