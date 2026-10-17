import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { HOUSE_MARGIN, priceTwoWay, totalReturn } from "./odds.ts"
import { acceptPick, PickRejected, type PickContext } from "./picks.ts"
import { confirmDue, decideReprice, REPRICE, type ExchangeView, type MarketState, type RepriceInput } from "./reprice.ts"
import { planSettlement } from "./settlement.ts"

const START = new Date("2026-10-18T17:00:00Z")
const NOW = new Date(START.getTime() - 60 * 60_000) // an hour before kickoff
const mins = (m: number) => new Date(NOW.getTime() + m * 60_000)

const BASIS = 0.55
const prices0 = priceTwoWay(BASIS)!
const market = (over: Partial<MarketState> = {}): MarketState => ({
  kind: "moneyline",
  status: "open",
  lockAt: START,
  createdAt: mins(-600),
  fairProbA: BASIS,
  pointA: null,
  prices: prices0,
  repricedAt: null,
  repriceCount: 0,
  exchangeOkAt: mins(-5),
  history: [],
  ...over,
})
const exchange = (over: Partial<ExchangeView> = {}): ExchangeView => ({ probA: 0.58, spread: 0.02, topSize: 1_000, ageMs: 1_000, bookTsAgeMs: 2_000, source: "polymarket", other: null, gameLive: false, acceptingOrders: true, point: null, ...over })
const input = (over: Partial<RepriceInput> = {}): RepriceInput => ({ now: NOW, startsAt: START, eventStatus: "scheduled", market: market(), exchange: exchange(), ...over })

describe("reprice decision: happy path and convention", () => {
  it("moves the line when the exchange drifted past the threshold, using the app's own margin and rounding", () => {
    const d = decideReprice(input())
    assert.equal(d.action, "update")
    if (d.action === "update") {
      assert.deepEqual(d.prices, priceTwoWay(0.58)) // same HOUSE_MARGIN and rounding as consensus publishing
      assert.equal(d.fairProbA, 0.58)
      assert.equal(d.source, "polymarket")
      assert.ok(d.prices[0] % 5 === 0 && d.prices[1] % 5 === 0)
      // Same house edge as consensus publishing: both sides' implied probabilities sum to at least 1 + HOUSE_MARGIN.
      const imp = (a: number) => (a < 0 ? -a / (-a + 100) : 100 / (a + 100))
      assert.ok(imp(d.prices[0]) + imp(d.prices[1]) >= 1 + HOUSE_MARGIN - 1e-9)
    }
  })
  it("a favourite moving the other way reprices both sides consistently", () => {
    const d = decideReprice(input({ exchange: exchange({ probA: 0.52 }) }))
    assert.equal(d.action, "update")
    if (d.action === "update") assert.ok(d.prices[0] > prices0[0] && d.prices[1] < prices0[1])
  })
  it("a move under the threshold changes nothing but confirms the exchange is healthy", () => {
    const d = decideReprice(input({ exchange: exchange({ probA: BASIS + REPRICE.minMove - 0.001 }) }))
    assert.deepEqual(d, { action: "none", reason: "within threshold", confirm: true })
  })
  it("is idempotent: the same read after the write changes nothing", () => {
    const first = decideReprice(input())
    assert.equal(first.action, "update")
    if (first.action !== "update") return
    const after = market({ fairProbA: first.fairProbA, prices: first.prices, repricedAt: NOW })
    const again = decideReprice(input({ market: after, now: mins(5) }))
    assert.equal(again.action, "none")
  })
  it("rate limits writes: not twice inside the minimum interval", () => {
    const m = market({ repricedAt: new Date(NOW.getTime() - 10_000) })
    assert.deepEqual(decideReprice(input({ market: m })), { action: "none", reason: "min interval", confirm: false })
    assert.equal(decideReprice(input({ market: m, now: new Date(NOW.getTime() + REPRICE.minIntervalMs) })).action, "update")
  })
})

describe("reprice decision: kickoff and lock boundary on the server clock", () => {
  it("refuses at and after the scheduled start, accepts the instant before", () => {
    const m = market({ lockAt: new Date(START.getTime() + 3600_000) }) // even with a late lock
    assert.equal(decideReprice(input({ market: m, now: new Date(START.getTime() - 1) })).action, "update")
    assert.deepEqual(decideReprice(input({ market: m, now: START })), { action: "none", reason: "kickoff", confirm: false })
    assert.equal(decideReprice(input({ market: m, now: new Date(START.getTime() + 60_000) })).action, "none")
  })
  it("never reprices a locked, frozen or non-scheduled market", () => {
    assert.equal(decideReprice(input({ market: market({ status: "locked" }) })).action, "none")
    assert.equal(decideReprice(input({ market: market({ lockAt: NOW }) })).action, "none")
    assert.equal(decideReprice(input({ eventStatus: "postponed" })).action, "none")
  })
})

describe("reprice decision: quality gates hold the current price", () => {
  const holds = (x: Partial<ExchangeView>) => {
    const d = decideReprice(input({ exchange: exchange(x) }))
    assert.equal(d.action, "none", JSON.stringify(d))
    return d.action === "none" ? d.reason : ""
  }
  it("holds on a wide, one-sided, stale or stuck book", () => {
    assert.equal(holds({ spread: 0.04 }), "book too wide")
    assert.equal(holds({ topSize: REPRICE.minTopSize - 1 }), "book too thin")
    assert.equal(holds({ topSize: null }), "book too thin")
    assert.equal(holds({ spread: null }), "book too wide")
    assert.equal(holds({ ageMs: 61_000 }), "read too old")
    assert.equal(holds({ bookTsAgeMs: 11 * 60_000 }), "book timestamp stuck")
    assert.equal(holds({ acceptingOrders: false }), "not accepting orders")
  })
  it("accepts a spread right at the limit", () => {
    assert.equal(decideReprice(input({ exchange: exchange({ spread: REPRICE.maxSpread }) })).action, "update")
  })
  it("holds when Polymarket and Kalshi disagree by more than the limit, uses them when they agree", () => {
    assert.equal(holds({ other: { source: "kalshi", probA: 0.58 + REPRICE.disagree + 0.01 } }), "sources disagree")
    assert.equal(decideReprice(input({ exchange: exchange({ other: { source: "kalshi", probA: 0.575 } }) })).action, "update")
  })
  it("no exchange read: unchanged, and a never-managed market is simply left to consensus", () => {
    assert.deepEqual(decideReprice(input({ exchange: null, market: market({ exchangeOkAt: null }) })), { action: "none", reason: "unavailable", confirm: false })
  })
})

describe("reprice decision: freezes (one-way) on danger", () => {
  const froze = (over: Partial<RepriceInput>) => {
    const d = decideReprice(input(over))
    assert.equal(d.action, "freeze", JSON.stringify(d))
    return d.action === "freeze" ? d.reason : ""
  }
  it("a suspicious jump freezes a managed market", () => {
    assert.match(froze({ exchange: exchange({ probA: BASIS + REPRICE.maxStep + 0.01 }) }), /jump/)
  })
  it("first contact allows a bigger gap than a managed step only when both exchanges agree, and never unlimited", () => {
    const first = market({ exchangeOkAt: null })
    const both = (probA: number) => exchange({ probA, other: { source: "kalshi", probA: probA - 0.005 } })
    assert.equal(decideReprice(input({ market: first, exchange: both(BASIS + 0.1) })).action, "update")
    assert.match(froze({ market: first, exchange: both(BASIS + REPRICE.firstContactMax + 0.01) }), /disagree/)
    // One source alone is held to the ordinary step.
    assert.equal(decideReprice(input({ market: first, exchange: exchange({ probA: BASIS + REPRICE.maxStep - 0.005 }) })).action, "update")
    assert.match(froze({ market: first, exchange: exchange({ probA: BASIS + REPRICE.maxStep + 0.01 }) }), /disagree/)
  })
  it("longshots and heavy favourites are never repriced: the market freezes", () => {
    assert.match(froze({ market: market({ fairProbA: 0.16 }), exchange: exchange({ probA: 0.14 }) }), /outside the repricing range/)
    assert.match(froze({ market: market({ fairProbA: 0.84 }), exchange: exchange({ probA: 0.86 }) }), /outside the repricing range/)
    assert.equal(decideReprice(input({ market: market({ fairProbA: 0.17 }), exchange: exchange({ probA: 0.155 }) })).action, "update")
  })
  it("cumulative movement over the hour freezes", () => {
    const history = [{ at: mins(-50), fairProbA: 0.45 }, { at: mins(-20), fairProbA: 0.5 }]
    assert.match(froze({ market: market({ fairProbA: 0.58, history }), exchange: exchange({ probA: 0.45 + REPRICE.hourRange + 0.01 }) }), /hour/)
    // The same history from two hours ago is ignored.
    const old = [{ at: mins(-120), fairProbA: 0.3 }]
    assert.equal(decideReprice(input({ market: market({ history: old }) })).action, "update")
  })
  it("the exchange showing the game in play before the scheduled start freezes", () => {
    assert.match(froze({ exchange: exchange({ gameLive: true }) }), /in play/)
  })
  it("a very lopsided price freezes instead of offering a giveaway", () => {
    assert.match(froze({ market: market({ fairProbA: 0.14 }), exchange: exchange({ probA: 0.07 }) }), /repricing range/)
  })
  it("a managed market with no good exchange read for 10 minutes freezes; a recent one just holds", () => {
    const stale = market({ exchangeOkAt: mins(-REPRICE.staleFreezeMs / 60_000 - 1) })
    assert.match(froze({ market: stale, exchange: null }), /unavailable for over 10 min/)
    assert.match(froze({ market: stale, exchange: exchange({ spread: 0.5 }) }), /too wide/)
    assert.equal(decideReprice(input({ market: market({ exchangeOkAt: mins(-2) }), exchange: null })).action, "none")
  })
})

describe("reprice decision: mapping rules", () => {
  it("spreads and totals only at the exact same point; no interpolation", () => {
    const spread = market({ kind: "spread", pointA: -3.5 })
    assert.equal(decideReprice(input({ market: spread, exchange: exchange({ point: -3.5 }) })).action, "update")
    assert.equal(decideReprice(input({ market: spread, exchange: exchange({ point: -3 }) })).action, "none")
    assert.equal(decideReprice(input({ market: spread, exchange: exchange({ point: null }) })).action, "none")
    assert.equal(decideReprice(input({ market: market({ kind: "total", pointA: 47.5 }), exchange: exchange({ point: 48.5 }) })).action, "none")
  })
  it("props are never repriced from an exchange here", () => {
    const d = decideReprice(input({ market: market({ kind: "player_prop", pointA: 60.5 }), exchange: exchange({ point: 60.5 }) }))
    assert.equal(d.action, "none")
  })
  it("confirm stamps are throttled", () => {
    assert.equal(confirmDue({ exchangeOkAt: null }, NOW), true)
    assert.equal(confirmDue({ exchangeOkAt: mins(-1) }, NOW), false)
    assert.equal(confirmDue({ exchangeOkAt: mins(-6) }, NOW), true)
  })
})

describe("accepted picks keep their price when the line is repriced", () => {
  const ctx = (price: number, over: Partial<PickContext> = {}): PickContext => ({
    now: NOW,
    market: { id: "m", status: "open", lockAt: START },
    eventStatus: "scheduled",
    eventStartsAt: START,
    line: { id: "l", marketId: "m", price, point: null },
    member: { credits: 1000 },
    league: { startingCredits: 1000 },
    picksOnMarket: 0,
    openPickCount: 0,
    openStakeTotal: 0,
    ...over,
  })
  const req = (price: number) => ({ stake: 60, lineId: "l", expectedPrice: price, expectedPoint: null })
  it("a stale client is refused with the new price in the message, never silently repriced", () => {
    let message = ""
    try {
      acceptPick(req(-120), ctx(-135))
    } catch (e) {
      assert.ok(e instanceof PickRejected)
      assert.equal(e.code, "line_mismatch")
      message = e.message
    }
    assert.match(message, /moved to -135/)
  })
  it("a client that saw the current price is accepted at exactly that price", () => {
    const a = acceptPick(req(-135), ctx(-135))
    assert.equal(a.price, -135)
    assert.equal(a.totalReturn, totalReturn(60, -135))
  })
  it("the pick's stored total return pays out whatever the line becomes afterwards", () => {
    const accepted = acceptPick(req(-120), ctx(-120))
    const pick = { id: "p", memberId: "mem", status: "open" as const, stake: accepted.stake, totalReturn: accepted.totalReturn }
    const plan = planSettlement([pick], new Map([["p", "win" as const]]), new Set())
    assert.equal(plan.ledger.find((l) => l.pickId === "p")?.amount, totalReturn(60, -120))
    assert.notEqual(totalReturn(60, -120), totalReturn(60, -200))
  })
})

describe("source-level guards: exchange data stays out of settlement, grading and acceptance", () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const importsOf = (f: string) => [...readFileSync(join(here, f), "utf8").matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!)
  it("settlement, grading, odds, lines, picks and result providers import neither live/ nor reprice", () => {
    for (const f of ["settlement.ts", "odds.ts", "lines.ts", "picks.ts", "providers/espn.ts", "providers/the-odds-api.ts", "providers/composite.ts"]) {
      assert.deepEqual(importsOf(f).filter((i) => /(^|\/)live(\/|$)|reprice/.test(i)), [], `${f} must not see exchange data`)
    }
  })
  it("reprice.ts is pure: it imports only the odds maths", () => {
    assert.deepEqual(importsOf("reprice.ts"), ["./odds.ts"])
  })
  it("applyReprice re-checks inside the lock: moneyline only, minimum interval, version and basis, master switch", () => {
    const code = readFileSync(join(here, "store.ts"), "utf8")
    const body = code.slice(code.indexOf("export function applyReprice"), code.indexOf("export async function confirmExchange"))
    for (const needle of ['m.kind !== "moneyline"', "REPRICE.minIntervalMs", "m.repriceCount !== expected.count", "expected.basis", "LIVE_ODDS_ENABLED"]) assert.ok(body.includes(needle), needle)
  })
  it("the only store function that writes line prices is applyReprice, behind the exclusive market lock", () => {
    const code = readFileSync(join(here, "store.ts"), "utf8")
    const writes = [...code.matchAll(/update\(sportsLines\)/g)].length
    assert.equal(writes, 1) // one statement (run for each side), inside applyReprice
    const body = code.slice(code.indexOf("export function applyReprice"), code.indexOf("export async function confirmExchange"))
    assert.match(body, /\.for\("update"\)/)
    assert.match(body, /kickoff/)
  })
  it("pick placement re-reads the line after taking the market lock", () => {
    const code = readFileSync(join(here, "store.ts"), "utf8")
    const start = code.indexOf("async function placeOnce")
    const place = code.slice(start, code.indexOf("const [league] = await tx", start))
    assert.ok(place.indexOf('.for("share")') < place.lastIndexOf("from(sportsLines)"), "line must be read after the shared market lock")
  })
})
