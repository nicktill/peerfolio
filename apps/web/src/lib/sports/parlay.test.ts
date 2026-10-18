import assert from "node:assert/strict"
import { test } from "node:test"
import { acceptParlay, combinedDecimal, decideParlay, decimalToAmerican, parlayReturn, ParlayRejected, type ParlayContext, type ParlayLegContext } from "./parlay.ts"

const now = new Date("2026-01-01T12:00:00Z")
const later = new Date("2026-01-01T18:00:00Z")
const leg = (n: number, over: Partial<ParlayLegContext> = {}, price = 100, point: number | null = null): ParlayLegContext => ({
  market: { id: `m${n}`, status: "open", lockAt: later, kind: "moneyline", player: null },
  eventId: `e${n}`,
  eventStatus: "scheduled",
  eventStartsAt: later,
  line: { id: `l${n}`, marketId: `m${n}`, price, point },
  ...over,
})
const ctxOf = (legs: ParlayLegContext[], over: Partial<ParlayContext> = {}): ParlayContext => ({
  now,
  legs,
  member: { credits: 1000 },
  league: { startingCredits: 1000, maxReturnPctOfStart: 50, maxExposurePctOfStart: 60, maxOpenPicks: 20 },
  openPickCount: 0,
  openStakeTotal: 0,
  ...over,
})
const reqOf = (legs: ParlayLegContext[], stake = 20) => ({ stake, legs: legs.map((l) => ({ lineId: l.line.id, expectedPrice: l.line.price, expectedPoint: l.line.point })) })
const rejects = (fn: () => unknown, code: string) => assert.throws(fn, (e) => e instanceof ParlayRejected && e.code === code)

test("combined odds multiply decimals", () => {
  assert.equal(combinedDecimal([100, 100]), 4)
  assert.equal(decimalToAmerican(4), 300)
  assert.equal(decimalToAmerican(combinedDecimal([-110, -110, -110])), 596)
  assert.equal(decimalToAmerican(1.5), -200)
  assert.equal(parlayReturn(20, 4), 80)
  assert.equal(parlayReturn(10, 1.9090909090909092 * 1.9090909090909092), 36)
})

test("accepts a valid two-leg parlay", () => {
  const legs = [leg(1), leg(2, {}, -110)]
  const a = acceptParlay(reqOf(legs), ctxOf(legs))
  assert.equal(a.totalReturn, Math.floor(20 * 2 * (1 + 100 / 110)))
  assert.equal(a.price, 282)
})

test("leg count bounds", () => {
  rejects(() => acceptParlay(reqOf([leg(1)]), ctxOf([leg(1)])), "too_few_legs")
  const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => leg(n))
  rejects(() => acceptParlay(reqOf(seven), ctxOf(seven)), "too_many_legs")
  const six = seven.slice(0, 6)
  assert.doesNotThrow(() => acceptParlay(reqOf(six, 10), ctxOf(six, { league: { startingCredits: 100000, maxReturnPctOfStart: 50, maxExposurePctOfStart: 60, maxOpenPicks: 20 } })))
})

test("one leg per event and no duplicates", () => {
  const legs = [leg(1), leg(2, { eventId: "e1" })]
  rejects(() => acceptParlay(reqOf(legs), ctxOf(legs)), "same_event")
  const dup = [leg(1), leg(1)]
  rejects(() => acceptParlay(reqOf(dup), ctxOf(dup)), "duplicate_leg")
})

test("locked, started, or closed legs are rejected", () => {
  for (const bad of [
    leg(2, { market: { id: "m2", status: "locked", lockAt: later, kind: "moneyline", player: null } }),
    leg(2, { market: { id: "m2", status: "open", lockAt: now, kind: "moneyline", player: null } }),
    leg(2, { eventStatus: "live" }),
    leg(2, { eventStartsAt: now }),
  ]) {
    const legs = [leg(1), bad]
    rejects(() => acceptParlay(reqOf(legs), ctxOf(legs)), "market_closed")
  }
})

test("props rejected; stale line rejected", () => {
  const prop = leg(2, { market: { id: "m2", status: "open", lockAt: later, kind: "player_prop", player: "X" } })
  rejects(() => acceptParlay(reqOf([leg(1), prop]), ctxOf([leg(1), prop])), "unsupported_leg")
  const legs = [leg(1), leg(2)]
  const req = reqOf(legs)
  req.legs[1]!.expectedPrice = 110
  rejects(() => acceptParlay(req, ctxOf(legs)), "line_mismatch")
  const sp = [leg(1), leg(2, {}, -110, -3.5)]
  const r2 = reqOf(sp)
  r2.legs[1]!.expectedPoint = -3
  rejects(() => acceptParlay(r2, ctxOf(sp)), "line_mismatch")
})

test("stake and exposure limits", () => {
  const legs = [leg(1), leg(2)]
  rejects(() => acceptParlay(reqOf(legs, 9), ctxOf(legs)), "stake_too_small")
  assert.doesNotThrow(() => acceptParlay(reqOf(legs, 1000), ctxOf(legs), { ...PARLAY_LIMITS, maxStakePctOfStart: Infinity }))
  rejects(() => acceptParlay(reqOf(legs, 20), ctxOf(legs, { member: { credits: 5 } })), "insufficient_credits")
  rejects(() => acceptParlay(reqOf(legs, 20), ctxOf(legs, { openPickCount: 20 })), "too_many_picks")
  assert.doesNotThrow(() => acceptParlay(reqOf(legs, 20), ctxOf(legs, { openStakeTotal: 590, league: { startingCredits: 1000, maxReturnPctOfStart: Infinity, maxExposurePctOfStart: Infinity, maxOpenPicks: 20 } }), { ...PARLAY_LIMITS, maxStakePctOfStart: Infinity })
  assert.doesNotThrow(() => acceptParlay(reqOf(legs, 20), ctxOf(legs, { league: { startingCredits: 1000, maxReturnPctOfStart: Infinity, maxExposurePctOfStart: Infinity, maxOpenPicks: 20 } }), { ...PARLAY_LIMITS, maxStakePctOfStart: Infinity })
})

const L = (status: "open" | "won" | "lost" | "push" | "void", price = 100) => ({ status, price })
test("settlement: all win", () => assert.deepEqual(decideParlay(10, [L("won"), L("won", -110)]), { status: "won", payout: Math.floor(10 * 2 * (1 + 100 / 110)) }))
test("settlement: one loses decides at once", () => assert.deepEqual(decideParlay(10, [L("lost"), L("open")]), { status: "lost", payout: 0 }))
test("settlement: push dropped", () => assert.deepEqual(decideParlay(10, [L("won", 200), L("push"), L("won", 100)]), { status: "won", payout: 60 }))
test("settlement: all void or push refunds", () => assert.deepEqual(decideParlay(10, [L("void"), L("push")]), { status: "void", payout: 10 }))
test("settlement: partial stays open", () => assert.deepEqual(decideParlay(10, [L("won"), L("open")]), { status: "open", payout: null }))
test("settlement: win then void leg pays remaining", () => assert.deepEqual(decideParlay(10, [L("won", 100), L("void")]), { status: "won", payout: 20 }))
