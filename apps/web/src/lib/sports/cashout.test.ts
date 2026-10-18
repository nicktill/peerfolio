import { test } from "node:test"
import assert from "node:assert/strict"
import { americanToDecimal } from "./odds.ts"
import { CASHOUT_FEE, liveCashout, pregameCashout, settleCashout, CashoutRejected } from "./cashout.ts"
import type { LiveView } from "./live/view.ts"

const pick = { stake: 1000, totalReturn: 2000, kind: "moneyline", selection: "home", point: null }
const view = (over: Partial<LiveView> = {}, odds: Record<string, unknown> = {}): LiveView => ({
  eventId: "e", status: "live", score: { home: 1, away: 0 }, period: null, clock: null, stateAsOf: null, stateFreshness: null, serverTime: "",
  odds: { status: "ok", homeProb: 0.6, awayProb: 0.4, drawProb: null, source: "polymarket", asOf: "", ageMs: 2000, freshness: "live", confidence: "high", mismatch: null, ...odds } as LiveView["odds"],
  ...over,
})

test("pregame: an unchanged line returns exactly the stake (no fee)", () => {
  assert.equal(CASHOUT_FEE, 0)
  assert.equal(pregameCashout(pick, { price: 100, point: null }, true)?.value, 1000)
})
test("pregame: an unchanged line returns exactly the stake at any price and stake, even though the total return is floored", () => {
  for (const american of [-110, -135, -250, -1000, 100, 115, 145, 210, 650]) {
    for (const stake of [7, 37, 100, 333, 750, 1250, 9999]) {
      const totalReturn = Math.floor(stake * americanToDecimal(american) + 1e-9)
      const q = pregameCashout({ stake, totalReturn, kind: "moneyline", selection: "home", point: null }, { price: american, point: null }, true)
      assert.equal(q?.value, stake, `${american} x ${stake}`)
    }
  }
})
test("pregame: the owner's Eagles pick (750 stake) sells for the stake, not 5% under", () => {
  const totalReturn = Math.floor(750 * americanToDecimal(-135) + 1e-9)
  assert.equal(pregameCashout({ stake: 750, totalReturn, kind: "moneyline", selection: "home", point: null }, { price: -135, point: null }, true)?.value, 750)
})
test("pregame: a shorter price is worth more", () => {
  assert.equal(pregameCashout(pick, { price: -200, point: null }, true)!.value, Math.ceil(2000 * (2 / 3) - 1e-9))
})
test("pregame: closed window, missing line or moved point offers nothing", () => {
  assert.equal(pregameCashout(pick, { price: 100, point: null }, false), null)
  assert.equal(pregameCashout(pick, null, true), null)
  assert.equal(pregameCashout({ ...pick, kind: "spread", point: -3 }, { price: -110, point: -3.5 }, true), null)
})
test("live: total return times probability", () => {
  assert.equal(liveCashout(pick, view())!.value, 1200)
})
test("live: never above the total return", () => {
  assert.equal(liveCashout(pick, view({}, { homeProb: 1 }))!.value, 2000)
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
