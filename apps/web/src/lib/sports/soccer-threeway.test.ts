import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { buildLiveView } from "./live/view.ts"
import { chooseLiveOdds } from "./live/reconcile.ts"
import { normalizeQuote, pairProbability3 } from "./live/quote.ts"
import { kalshiQuotes, parseGammaEvents, parseKalshiEvents, pmQuotes } from "./live/sources.ts"
import { runRepricePass } from "./live/reprice-pass.ts"
import { newWorkerState, type WorkerDeps } from "./live/worker.ts"
import { detectMove, draftMarket, EXCHANGE_PUBLISH, DEFAULT_PUBLISH, kindsFor } from "./lines.ts"
import { americanToProb, HOUSE_MARGIN } from "./odds.ts"
import { confirmDue, decideReprice, REPRICE, type MarketState, type RepriceStore, type RepriceTarget } from "./reprice.ts"
import { gradePick, planSettlement } from "./settlement.ts"
import { exchangeThreeWay, type ThreeWayBooks, type YesBook } from "./threeway-exchange.ts"
import { priceThreeWay, type Triple } from "./threeway.ts"
import { splitPct3 } from "./live/format.ts"
import { lineLabel, marketTitle, pickSentence } from "./format.ts"
import type { ProviderEvent, ProviderMarket } from "./types.ts"

const here = dirname(fileURLToPath(import.meta.url))
const NOW = new Date("2026-10-18T22:30:00Z")
const START = new Date("2026-10-18T23:30:00Z")

/* ---------------- grading ---------------- */

describe("grading: a draw is a result in MLS, a tie keeps its old rule elsewhere", () => {
  const res = (h: number, a: number) => ({ source: "espn", externalId: "1", status: "final" as const, homeScore: h, awayScore: a })
  const g = (sport: string, selection: "home" | "away" | "draw", h: number, a: number) => gradePick({ sport, kind: "moneyline", selection, point: null, player: null, statKey: null }, res(h, a))

  it("MLS: equal score never voids or pushes", () => {
    assert.equal(g("mls", "draw", 1, 1), "win")
    assert.equal(g("mls", "home", 1, 1), "loss")
    assert.equal(g("mls", "away", 0, 0), "loss")
    assert.equal(g("mls", "home", 2, 1), "win")
    assert.equal(g("mls", "draw", 2, 1), "loss")
    assert.equal(g("mls", "away", 0, 3), "win")
  })
  it("other sports unchanged: nhl/mlb/nba/tennis void a tie, nfl/cfb push it; a draw line anywhere else is void", () => {
    for (const sport of ["nhl", "mlb", "nba", "tennis"]) assert.equal(g(sport, "home", 2, 2), "void", sport)
    for (const sport of ["nfl", "cfb"]) assert.equal(g(sport, "home", 20, 20), "push", sport)
    assert.equal(g("nba", "draw", 100, 100), "void")
    assert.equal(g("nfl", "draw", 20, 10), "void")
  })
  it("unfinished or scoreless games void, and spreads and totals for MLS are untouched", () => {
    assert.equal(gradePick({ sport: "mls", kind: "moneyline", selection: "draw", point: null, player: null, statKey: null }, { source: "espn", externalId: "1", status: "in_progress", homeScore: 1, awayScore: 1 }), "void")
    assert.equal(gradePick({ sport: "mls", kind: "total", selection: "over", point: 2.5, player: null, statKey: null }, res(2, 1)), "win")
    assert.equal(gradePick({ sport: "mls", kind: "spread", selection: "away", point: 0.5, player: null, statKey: null }, res(1, 1)), "win")
  })
  it("a won draw pick pays its stored return through the normal settlement plan", () => {
    const pick = { id: "p", memberId: "m", status: "open" as const, stake: 100, totalReturn: 380 }
    const plan = planSettlement([pick], new Map([["p", g("mls", "draw", 0, 0)]]), new Set())
    assert.equal(plan.ledger[0]?.amount, 380)
  })
})

/* ---------------- publishing ---------------- */

const q = (book: string, price: number) => ({ book, price, point: null, at: NOW })
const mlsEvent = (market: ProviderMarket): ProviderEvent => ({ externalId: "e1", sport: "mls", homeName: "Atlanta United FC", awayName: "Inter Miami CF", startsAt: START, markets: [market] })
const threeMarket = (n = 3, draw = true): ProviderMarket => ({
  key: "moneyline",
  kind: "moneyline",
  outcomes: [
    { selection: "home", quotes: Array.from({ length: n }, (_, i) => q(`b${i}`, 250)) },
    ...(draw ? [{ selection: "draw" as const, quotes: Array.from({ length: n }, (_, i) => q(`b${i}`, 240)) }] : []),
    { selection: "away", quotes: Array.from({ length: n }, (_, i) => q(`b${i}`, 120)) },
  ],
})

describe("publishing the three-way moneyline", () => {
  it("MLS now offers a moneyline, and drafts home / draw / away with fair triple and margin", () => {
    assert.deepEqual(kindsFor("mls", DEFAULT_PUBLISH), ["moneyline", "spread", "total"])
    const ev = mlsEvent(threeMarket())
    const d = draftMarket(ev, ev.markets[0]!, DEFAULT_PUBLISH, NOW)!
    assert.deepEqual(d.lines.map((l) => l.selection), ["home", "draw", "away"])
    assert.ok(Math.abs(d.fairs.reduce((a, b) => a + b, 0) - 1) < 1e-9)
    assert.equal(d.fairProbA, d.fairs[0])
    assert.ok(d.lines.reduce((s, l) => s + americanToProb(l.price), 0) >= 1 + HOUSE_MARGIN - 1e-9)
    assert.ok(d.lines.every((l) => l.point === null && Math.abs(l.price) % 5 === 0))
  })
  it("never prices a soccer moneyline as two-way: no draw quotes, no market; too few books, no market", () => {
    const noDraw = mlsEvent(threeMarket(3, false))
    assert.equal(draftMarket(noDraw, noDraw.markets[0]!, DEFAULT_PUBLISH, NOW), null)
    const thin = mlsEvent(threeMarket(2))
    assert.equal(draftMarket(thin, thin.markets[0]!, DEFAULT_PUBLISH, NOW), null)
    const one = mlsEvent(threeMarket(1))
    assert.ok(draftMarket(one, one.markets[0]!, EXCHANGE_PUBLISH, NOW), "a single exchange book is enough in exchange mode")
  })
  it("other sports' moneyline stay two-way", () => {
    const ev: ProviderEvent = { ...mlsEvent(threeMarket()), sport: "nhl" }
    const m: ProviderMarket = { key: "moneyline", kind: "moneyline", outcomes: [{ selection: "home", quotes: [q("a", -120), q("b", -118), q("c", -122)] }, { selection: "away", quotes: [q("a", 100), q("b", 102), q("c", 100)] }] }
    assert.equal(draftMarket(ev, m, DEFAULT_PUBLISH, NOW)!.lines.length, 2)
  })
  it("detectMove sees the draw move alone", () => {
    const ev = mlsEvent(threeMarket())
    const d = draftMarket(ev, ev.markets[0]!, DEFAULT_PUBLISH, NOW)!
    const stored = { kind: "moneyline" as const, lockAt: START, fairProbA: d.fairs[0]!, pointA: null, fairs: d.fairs }
    assert.equal(detectMove(stored, d), null)
    const moved = { ...d, fairs: [d.fairs[0]!, d.fairs[1]! + 0.05, d.fairs[2]! - 0.05] }
    assert.equal(detectMove(stored, moved), "line moved")
    assert.equal(detectMove({ ...stored, fairs: null }, moved), null, "without stored per-side fairs only the first side can be compared")
  })
})

/* ---------------- the repricing decision ---------------- */

const BASIS3: Triple = [0.4, 0.28, 0.32]
const P0 = priceThreeWay(BASIS3)!
const mstate = (over: Partial<MarketState> = {}): MarketState => ({
  kind: "moneyline",
  status: "open",
  lockAt: START,
  createdAt: new Date(NOW.getTime() - 3_600_000),
  fairProbA: BASIS3[0],
  fairs: BASIS3,
  pointA: null,
  prices: P0,
  repricedAt: null,
  repriceCount: 0,
  exchangeOkAt: new Date(NOW.getTime() - 60_000),
  history: [],
  ...over,
})
const yes = (p: number, o: Partial<YesBook> = {}): YesBook => ({ bid: p - 0.01, ask: p + 0.01, topSize: 500, ageMs: 1_000, bookTsAgeMs: 1_000, ...o })
const books3 = (t: Triple, o: Partial<YesBook> = {}): ThreeWayBooks => ({ home: yes(t[0], o), draw: yes(t[1], o), away: yes(t[2], o) })
const ex3 = (t: Triple, over: { other?: ThreeWayBooks | null; gameLive?: boolean; o?: Partial<YesBook> } = {}) =>
  exchangeThreeWay({ source: "polymarket", books: books3(t, over.o), other: over.other ?? null, gameLive: over.gameLive ?? false, acceptingOrders: true })
const decide = (t: Triple | null, over: Partial<Parameters<typeof decideReprice>[0]> = {}, x?: ReturnType<typeof ex3>) =>
  decideReprice({ now: NOW, startsAt: START, eventStatus: "scheduled", market: mstate(), exchange: null, exchange3: x ?? (t ? ex3(t) : null), ...over })

describe("pregame repricing of the three-way moneyline", () => {
  it("reprices all three sides from a move, with the same margin and rounding as publishing", () => {
    const d = decide([0.43, 0.27, 0.3])
    assert.equal(d.action, "update")
    if (d.action !== "update") return
    assert.deepEqual(d.prices, priceThreeWay(d.fairs as Triple))
    assert.equal(d.prices.length, 3)
    assert.equal(d.fairProbA, d.fairs![0])
    assert.ok(Math.abs(d.fairs!.reduce((a, b) => a + b, 0) - 1) < 1e-9)
    assert.ok(d.prices.reduce((s, p) => s + americanToProb(p), 0) >= 1 + HOUSE_MARGIN - 1e-9)
  })
  it("a move on the draw alone counts as a move", () => {
    const d = decide([0.4, 0.3, 0.3])
    assert.equal(d.action, "update")
  })
  it("a move under the threshold only confirms the exchange; the same read twice changes nothing", () => {
    assert.deepEqual(decide([0.405, 0.278, 0.317]), { action: "none", reason: "within threshold", confirm: true })
    const first = decide([0.43, 0.27, 0.3])
    assert.equal(first.action, "update")
    if (first.action !== "update") return
    const again = decide([0.43, 0.27, 0.3], { market: mstate({ prices: first.prices, fairs: first.fairs, fairProbA: first.fairProbA, repricedAt: new Date(NOW.getTime() - 120_000), repriceCount: 1 }) })
    assert.equal(again.action, "none")
  })
  it("respects the minimum interval", () => {
    const d = decide([0.43, 0.27, 0.3], { market: mstate({ repricedAt: new Date(NOW.getTime() - 5_000) }) })
    assert.deepEqual(d, { action: "none", reason: "min interval", confirm: false })
  })
  it("freezes on a jump larger than one step for a managed market, and holds without a stored basis", () => {
    assert.deepEqual(decide([0.5, 0.25, 0.25]), { action: "freeze", reason: "exchange jump" })
    const h = decide([0.43, 0.27, 0.3], { market: mstate({ fairs: null }) })
    assert.deepEqual(h, { action: "none", reason: "no fair basis stored", confirm: false })
  })
  it("freezes when any side moved too far in an hour", () => {
    const history = [{ at: new Date(NOW.getTime() - 30 * 60_000), fairProbA: 0.26, fairs: [0.26, 0.46, 0.28] }]
    const d = decide([0.43, 0.27, 0.3], { market: mstate({ history }) })
    assert.deepEqual(d, { action: "freeze", reason: "exchange moved too far in an hour" })
  })
  it("every leg's gate is applied: a thin, wide, stale or lopsided book holds or freezes; the cross-check can veto", () => {
    assert.equal(decide(null, {}, ex3([0.43, 0.27, 0.3], { o: { topSize: 10 } })).action, "none")
    assert.deepEqual(decide(null, {}, ex3([0.43, 0.27, 0.3], { o: { ageMs: 120_000 } })), { action: "none", reason: "polymarket read too old", confirm: false })
    const wide = ex3([0.43, 0.27, 0.3], { o: { bid: 0.2, ask: 0.3 } })
    assert.equal(wide.ok, false)
    assert.deepEqual(decide(null, {}, ex3([0.4, 0.28, 0.32], { other: books3([0.5, 0.2, 0.3]) })), { action: "none", reason: "sources disagree", confirm: false })
    assert.equal(decide([0.8, 0.12, 0.08]).action, "freeze")
    assert.deepEqual(decide(null, {}, ex3([0.4, 0.28, 0.32], { gameLive: true })), { action: "freeze", reason: "exchange shows the game in play before its scheduled start" })
    assert.equal(decide(null).action, "none")
  })
  it("a managed market whose exchange has been quiet too long freezes", () => {
    const long = mstate({ exchangeOkAt: new Date(NOW.getTime() - REPRICE.staleFreezeMs - 1) })
    assert.equal(decide(null, { market: long }).action, "freeze")
  })
  it("kickoff, closed and locked still stop everything", () => {
    assert.equal(decide([0.43, 0.27, 0.3], { now: START }).action, "none")
    assert.equal(decide([0.43, 0.27, 0.3], { eventStatus: "postponed" }).action, "none")
    assert.equal(confirmDue(mstate(), NOW), false)
  })
})

/* ---------------- live: parsing, quotes, view ---------------- */

const tw = (live = false) => [
  {
    slug: "mls-atl-mia-2026-10-17",
    title: "Atlanta United FC vs. Inter Miami CF",
    live,
    ended: false,
    startTime: START.toISOString(),
    markets: [
      { sportsMarketType: "moneyline", groupItemTitle: "Atlanta United FC", question: "Will Atlanta United FC win on 2026-10-17?", outcomes: '["Yes", "No"]', clobTokenIds: '["a-yes","a-no"]', acceptingOrders: true },
      { sportsMarketType: "moneyline", groupItemTitle: "Draw (Atlanta United FC vs. Inter Miami CF)", question: "Will Atlanta United FC vs. Inter Miami CF end in a draw?", outcomes: '["Yes", "No"]', clobTokenIds: '["d-yes","d-no"]', acceptingOrders: true },
      { sportsMarketType: "moneyline", groupItemTitle: "Inter Miami CF", question: "Will Inter Miami CF win on 2026-10-17?", outcomes: '["Yes", "No"]', clobTokenIds: '["m-yes","m-no"]', acceptingOrders: true },
    ],
  },
]
const clob = (id: string, mid: number, half = 0.01, size = "1000") => ({ asset_id: id, timestamp: String(NOW.getTime() - 500), bids: [{ price: String(mid - half), size }], asks: [{ price: String(mid + half), size }] })

describe("soccer parsing and quotes", () => {
  it("parseGammaEvents accepts three Yes/No markets as one game with a draw token, teams from the market titles", () => {
    const [g] = parseGammaEvents(tw())
    assert.deepEqual(g!.teams, ["Atlanta United FC", "Inter Miami CF"])
    assert.deepEqual(g!.tokens, ["a-yes", "m-yes"])
    assert.equal(g!.drawToken, "d-yes")
    assert.equal(parseGammaEvents(tw()).length, 1)
  })
  it("rejects a Yes/No set that is not exactly two teams and a draw, and keeps the two-team case unchanged", () => {
    const bad = tw()
    bad[0]!.markets.pop()
    assert.equal(parseGammaEvents(bad).length, 0)
    const dup = tw()
    dup[0]!.markets[2] = { ...dup[0]!.markets[1]! }
    assert.equal(parseGammaEvents(dup).length, 0)
    const two = parseGammaEvents([{ slug: "nba-a-b-2026-10-20", startTime: START.toISOString(), markets: [{ sportsMarketType: "moneyline", outcomes: '["A","B"]', clobTokenIds: '["x","y"]' }] }])
    assert.equal(two[0]!.drawToken, null)
  })
  it("pmQuotes returns home, away and draw books oriented to our home team", () => {
    const [g] = parseGammaEvents(tw())
    const books = [clob("a-yes", 0.28), clob("d-yes", 0.22), clob("m-yes", 0.5)]
    const home = pmQuotes(g!, 0, books, NOW)
    assert.deepEqual(home.map((x) => x.selection).sort(), ["away", "draw", "home"])
    assert.equal(home.find((x) => x.selection === "home")!.bid! < 0.3, true)
    const swapped = pmQuotes(g!, 1, books, NOW)
    assert.ok(swapped.find((x) => x.selection === "home")!.bid! > 0.45)
  })
  it("parseKalshiEvents reads the third (Tie) contract and kalshiQuotes returns a draw quote", () => {
    const payload = { events: [{ event_ticker: "K1", title: "Atlanta vs Miami", markets: [
      { ticker: "K1-ATL", yes_sub_title: "Atlanta", yes_bid_dollars: "0.2800", yes_ask_dollars: "0.2900" },
      { ticker: "K1-MIA", yes_sub_title: "Miami", yes_bid_dollars: "0.5000", yes_ask_dollars: "0.5100" },
      { ticker: "K1-TIE", yes_sub_title: "Tie", yes_bid_dollars: "0.2100", yes_ask_dollars: "0.2200" },
    ] }] }
    const [g] = parseKalshiEvents(payload)
    assert.equal(g!.markets.length, 3)
    const qs = kalshiQuotes(g!, "Atlanta United FC", "Inter Miami CF", NOW)
    assert.deepEqual(qs.map((x) => x.selection), ["home", "away", "draw"])
    assert.equal(qs.find((x) => x.selection === "draw")!.bid, 0.21)
    const two = { events: [{ event_ticker: "K2", title: "A vs B", markets: payload.events[0]!.markets.slice(0, 2) }] }
    assert.equal(kalshiQuotes(parseKalshiEvents(two)[0]!, "Atlanta", "Miami", NOW).length, 2)
    const oddThree = { events: [{ event_ticker: "K3", title: "A vs B", markets: payload.events[0]!.markets.slice(0, 2).concat({ ticker: "x", yes_sub_title: "Other", yes_bid_dollars: "0.1", yes_ask_dollars: "0.2" } as never) }] }
    assert.equal(parseKalshiEvents(oddThree).length, 0)
  })
})

describe("live view for a soccer game", () => {
  const row = (selection: string, bid: number, ask: number, source = "polymarket") => ({ market: "moneyline", selection, source, bid, ask, mid: null, sourceTs: null, fetchedTs: new Date(NOW.getTime() - 3_000) })
  const rows = [row("home", 0.27, 0.29), row("draw", 0.21, 0.23), row("away", 0.49, 0.51)]

  it("pairProbability3 normalises the three mids and rejects a set that is not one market", () => {
    const n = (s: string, b: number, a: number) => normalizeQuote({ source: "polymarket", selection: s as "home", bid: b, ask: a, sourceTs: null, fetchedTs: NOW }, NOW)
    const p = pairProbability3(n("home", 0.27, 0.29), n("draw", 0.21, 0.23), n("away", 0.49, 0.51))!
    assert.ok(Math.abs(p.homeProb + p.drawProb! + (1 - p.homeProb - p.drawProb!) - 1) < 1e-12)
    assert.equal(pairProbability3(n("home", 0.27, 0.29), undefined, n("away", 0.49, 0.51)), null)
    assert.equal(pairProbability3(n("home", 0.5, 0.52), n("draw", 0.5, 0.52), n("away", 0.5, 0.52)), null)
  })
  it("serves home, draw and away probabilities that add to one", () => {
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", sport: "mls", quotes: rows, state: null }, NOW)
    assert.equal(v.odds.status, "ok")
    if (v.odds.status !== "ok") return
    assert.ok(v.odds.drawProb != null && v.odds.drawProb > 0.15 && v.odds.drawProb < 0.3)
    assert.ok(Math.abs(v.odds.homeProb + v.odds.drawProb + v.odds.awayProb - 1) < 1e-12)
  })
  it("for soccer a lone 'home wins' model number is never turned into odds, and a two-way sport ignores draw rows", () => {
    const espn = [{ market: "moneyline", selection: "home", source: "espn", bid: null, ask: null, mid: 0.4, sourceTs: null, fetchedTs: new Date(NOW.getTime() - 3_000) }]
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", sport: "mls", quotes: espn, state: null }, NOW)
    assert.equal(v.odds.status, "paused")
    const nba = buildLiveView({ eventId: "e", eventStatus: "scheduled", sport: "nba", quotes: [row("home", 0.55, 0.57), row("away", 0.43, 0.45), row("draw", 0.2, 0.22)], state: null }, NOW)
    assert.equal(nba.odds.status === "ok" && nba.odds.drawProb, null)
  })
  it("two order books that disagree on the draw alone are flagged", () => {
    const view = (source: "polymarket" | "kalshi", draw: number) => ({ source, homeProb: 0.3, drawProb: draw, asOf: NOW, ageMs: 1_000, spread: 0.02, confidence: "high" as const, freshness: "live" as const })
    const o = chooseLiveOdds([view("polymarket", 0.22), view("kalshi", 0.34)], { threeWay: true })
    assert.equal(o.status === "ok" && o.mismatch?.with, "kalshi")
  })
})

describe("soccer percent split", () => {
  it("always adds to 100 and keeps every segment visible", () => {
    for (const [h, d] of [[0.28, 0.22], [0.5, 0.25], [0.005, 0.004], [0.97, 0.02], [0.4, 0.6]] as const) {
      const s = splitPct3(h, d)
      assert.equal(s.home + s.draw + s.away, 100)
      assert.ok(s.home >= 1 && s.draw >= 1 && s.away >= 1, JSON.stringify(s))
    }
  })
})

describe("pregame pass reprices a soccer market from three books", () => {
  const lineup = (mids: [number, number, number], opts: { half?: number; size?: string; live?: boolean } = {}) => {
    const applied: { prices: number[]; fairs?: number[] }[] = []
    const frozen: string[] = []
    const store: RepriceStore = {
      listTargets: async () => [target()],
      apply: async (_id, _e, d) => (applied.push({ prices: d.prices, fairs: d.fairs }), { applied: true, oldPrices: P0, newPrices: d.prices, version: 2 }),
      freeze: async (id, reason) => (frozen.push(`${id}:${reason}`), true),
      confirm: async () => {},
    }
    const deps: WorkerDeps = {
      store: { loadSlate: async () => [], insertQuotes: async () => {}, upsertState: async () => {} },
      reprice: store,
      getJson: async (u) => {
        if (u.includes("gamma-api")) return tw(opts.live)
        if (u.includes("kalshi")) return { events: [] }
        throw new Error(u)
      },
      postJson: async (_u, body) => {
        const byTok: Record<string, number> = { "a-yes": mids[0], "d-yes": mids[1], "m-yes": mids[2] }
        return (body as { token_id: string }[]).map(({ token_id }) => clob(token_id, byTok[token_id] ?? 0.5, opts.half, opts.size))
      },
    }
    return { deps, applied, frozen }
  }
  const target = (): RepriceTarget => ({ marketId: "m1", eventId: "ev1", sport: "mls", homeName: "Atlanta United FC", awayName: "Inter Miami CF", startsAt: START, eventStatus: "scheduled", state: mstate() })

  it("writes a new triple of prices when the three books moved", async () => {
    const h = lineup([0.43, 0.27, 0.3])
    const r = await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.equal(r?.updated, 1)
    assert.equal(h.applied[0]!.prices.length, 3)
    assert.equal(h.applied[0]!.fairs!.length, 3)
  })
  it("a thin book holds, an in-play game freezes", async () => {
    const thin = lineup([0.43, 0.27, 0.3], { size: "5" })
    assert.equal((await runRepricePass(thin.deps, newWorkerState(), NOW))?.updated, 0)
    const live = lineup([0.43, 0.27, 0.3], { live: true })
    const r = await runRepricePass(live.deps, newWorkerState(), NOW)
    assert.equal(r?.frozen, 1)
    assert.match(live.frozen[0]!, /in play/)
  })
})

/* ---------------- display ---------------- */

describe("display of a draw", () => {
  const ev = { sport: "mls", home: "Atlanta United FC", away: "Inter Miami CF" }
  it("labels the draw line and keeps team names for the other two", () => {
    assert.deepEqual(lineLabel({ kind: "moneyline", player: null, statKey: null, event: ev }, { selection: "draw", point: null }), { name: "Draw", point: "" })
    assert.equal(lineLabel({ kind: "moneyline", player: null, statKey: null, event: ev }, { selection: "home", point: null }).name, "Atlanta United FC")
    assert.equal(pickSentence({ kind: "moneyline", player: null, statKey: null, event: ev }, { selection: "draw", point: null }), "Draw")
    assert.equal(marketTitle({ kind: "moneyline", player: null, statKey: null, event: ev }), "Winner")
  })
})

/* ---------------- source-level guards ---------------- */

describe("three-way integration keeps the money path clean", () => {
  const importsOf = (f: string) => [...readFileSync(join(here, f), "utf8").matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!)
  it("settlement and pricing import no exchange mapping, live code or reprice", () => {
    for (const f of ["settlement.ts", "lines.ts", "odds.ts", "picks.ts", "threeway.ts"]) assert.deepEqual(importsOf(f).filter((i) => /exchange|reprice|(^|\/)live(\/|$)/.test(i)), [], f)
  })
  it("the store still has a single price-writing statement and no draw special-casing in picks", () => {
    const code = readFileSync(join(here, "store.ts"), "utf8")
    assert.equal([...code.matchAll(/update\(sportsLines\)/g)].length, 1)
    assert.ok(!readFileSync(join(here, "picks.ts"), "utf8").includes("draw"))
  })
})
