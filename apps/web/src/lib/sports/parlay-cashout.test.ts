import { test } from "node:test"
import assert from "node:assert/strict"
import { priceParlayCashout, type ParlayCashoutLeg } from "./parlay-cashout.ts"
import { combinedDecimal, parlayReturn } from "./parlay.ts"
import { americanToProb } from "./odds.ts"
import type { LiveView } from "./live/view.ts"

const view = (odds: Record<string, unknown> = {}, over: Partial<LiveView> = {}): LiveView => ({
  eventId: "e", status: "live", score: { home: 1, away: 0 }, period: null, clock: null, stateAsOf: null, stateFreshness: null, serverTime: "",
  odds: { status: "ok", homeProb: 0.6, awayProb: 0.4, drawProb: null, source: "polymarket", asOf: "", ageMs: 2000, freshness: "live", confidence: "high", mismatch: null, ...odds } as LiveView["odds"],
  ...over,
})
const leg = (over: Partial<ParlayCashoutLeg> = {}): ParlayCashoutLeg => ({
  status: "open", price: 100, kind: "moneyline", selection: "home", point: null, phase: "pregame", line: { price: 100, point: null }, view: null, ...over,
})
const parlay = { stake: 100, totalReturn: 400 }

test("pregame legs: return x product of line probabilities x one fee", () => {
  const r = priceParlayCashout(parlay, [leg(), leg({ line: { price: -200, point: null } })])
  assert.ok(r.available)
  assert.equal(r.value, Math.floor(400 * 0.5 * (2 / 3) * 0.95 + 1e-9))
  assert.equal(r.source, "pregame")
})

test("unchanged lines return a little under the fair value, never above the total return", () => {
  const r = priceParlayCashout(parlay, [leg({ line: { price: -100000, point: null } }), leg({ line: { price: -100000, point: null } })])
  assert.ok(r.available)
  assert.ok(r.value <= 400)
  assert.equal(r.value, Math.floor(400 * americanToProb(-100000) ** 2 * 0.95 + 1e-9))
})

test("a won leg counts as certain", () => {
  const r = priceParlayCashout(parlay, [leg({ status: "won" }), leg()])
  assert.ok(r.available)
  assert.equal(r.value, Math.floor(400 * 0.5 * 0.95 + 1e-9))
})

test("a lost leg means no value", () => {
  const r = priceParlayCashout(parlay, [leg({ status: "lost" }), leg()])
  assert.equal(r.available, false)
})

test("a pushed or void leg drops out and the return is rebuilt from the other legs' original odds", () => {
  const legs = [leg({ status: "push", price: 150 }), leg({ price: 100 }), leg({ price: -110 })]
  const r = priceParlayCashout({ stake: 100, totalReturn: parlayReturn(100, combinedDecimal([150, 100, -110])) }, legs)
  assert.ok(r.available)
  const base = parlayReturn(100, combinedDecimal([100, -110]))
  assert.equal(r.fullReturn, base)
  assert.equal(r.value, Math.floor(base * 0.5 * 0.5 * 0.95 + 1e-9))
  const v = priceParlayCashout(parlay, [leg({ status: "void", price: 100 }), leg({ price: 100 }), leg({ status: "won", price: 100 })])
  assert.ok(v.available)
  assert.equal(v.fullReturn, parlayReturn(100, combinedDecimal([100, 100])))
})

test("everything dropped or decided is not priceable", () => {
  assert.equal(priceParlayCashout(parlay, [leg({ status: "push" }), leg({ status: "void" })]).available, false)
  assert.equal(priceParlayCashout(parlay, [leg({ status: "won" }), leg({ status: "won" })]).available, false)
  assert.equal(priceParlayCashout(parlay, []).available, false)
})

test("pregame leg: moved point, missing line or closed phase makes the whole parlay unavailable", () => {
  assert.equal(priceParlayCashout(parlay, [leg(), leg({ kind: "spread", point: -3, line: { price: -110, point: -3.5 } })]).available, false)
  assert.equal(priceParlayCashout(parlay, [leg(), leg({ line: null })]).available, false)
  assert.equal(priceParlayCashout(parlay, [leg(), leg({ phase: "closed" })]).available, false)
})

test("a spread point that held is priced", () => {
  const r = priceParlayCashout(parlay, [leg(), leg({ kind: "spread", point: -3, line: { price: -110, point: -3 } })])
  assert.ok(r.available)
})

test("live moneyline leg uses the fresh high-confidence quote", () => {
  const r = priceParlayCashout(parlay, [leg({ status: "won" }), leg({ phase: "live", view: view() })])
  assert.ok(r.available)
  assert.equal(r.value, Math.floor(400 * 0.6 * 0.95 + 1e-9))
  assert.equal(r.source, "live")
  const mixed = priceParlayCashout(parlay, [leg(), leg({ phase: "live", view: view() })])
  assert.ok(mixed.available)
  assert.equal(mixed.source, "mixed")
})

test("live leg: stale, low confidence, mismatch, no view, not live, spread or total is unavailable", () => {
  const bad = (l: Partial<ParlayCashoutLeg>) => priceParlayCashout(parlay, [leg(), leg({ phase: "live", ...l })]).available
  assert.equal(bad({ view: view({ ageMs: 40_000 }) }), false)
  assert.equal(bad({ view: view({ confidence: "low" }) }), false)
  assert.equal(bad({ view: view({ mismatch: true }) }), false)
  assert.equal(bad({ view: null }), false)
  assert.equal(bad({ view: view({}, { status: "pre" }) }), false)
  assert.equal(bad({ view: view(), kind: "spread", point: -3 }), false)
  assert.equal(bad({ view: view(), kind: "total", selection: "over", point: 45 }), false)
})

test("elapsed time since the read counts against freshness", () => {
  const legs = [leg({ status: "won" }), leg({ phase: "live", view: view({ ageMs: 20_000 }) })]
  assert.equal(priceParlayCashout(parlay, legs, 0).available, true)
  assert.equal(priceParlayCashout(parlay, legs, 15_000).available, false)
})

test("an estimate is the unrounded value without the fee", () => {
  const r = priceParlayCashout(parlay, [leg({ status: "won" }), leg({ phase: "live", view: view() })])
  assert.ok(r.available)
  assert.ok(Math.abs(r.estimate - 240) < 1e-9)
})

test("a value under one credit is not offered", () => {
  const r = priceParlayCashout({ stake: 10, totalReturn: 20 }, [leg({ line: { price: 10000, point: null } }), leg({ line: { price: 10000, point: null } })])
  assert.equal(r.available, false)
})
