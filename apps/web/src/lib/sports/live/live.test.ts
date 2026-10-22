import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { clientIp, createMemoryLimiter, createTtlCache } from "./cache.ts"
import { ageOf, agoLabel, freshnessOf, LIVE_MAX_MS, PIPELINE, WORST_CASE_AGE_MS } from "./freshness.ts"
import { chipFor, splitPct, statusLine } from "./format.ts"
import { explainNoMatch, matchGame, normName, orientScore, sameTeam } from "./match.ts"
import { bookClock, idleSleepMs, liveSlate, pollDelay, shouldWrite } from "./plan.ts"
import { normalizeQuote, pairProbability, topOfBook } from "./quote.ts"
import { chooseLiveOdds } from "./reconcile.ts"
import { retentionCutoffs, survivors } from "./retention.ts"
import {
  applyWsMessage,
  espnWinProb,
  kalshiQuotes,
  parseClobBook,
  parseEspnScoreboard,
  parseGammaEvents,
  parseKalshiEvents,
  pmGameState,
  pmQuotes,
  type WsBook,
} from "./sources.ts"
import type { RawQuote, SourceProb } from "./types.ts"
import { ageView, buildLiveView } from "./view.ts"

const NOW = new Date("2026-10-18T20:00:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const raw = (over: Partial<RawQuote> = {}): RawQuote => ({ source: "polymarket", selection: "home", bid: 0.5, ask: 0.52, sourceTs: ago(1000), fetchedTs: ago(500), ...over })

describe("freshness states", () => {
  it("live under 30s, delayed 30-120s, stale after", () => {
    assert.equal(freshnessOf(0), "live")
    assert.equal(freshnessOf(29_999), "live")
    assert.equal(freshnessOf(30_000), "delayed")
    assert.equal(freshnessOf(120_000), "delayed")
    assert.equal(freshnessOf(120_001), "stale")
  })
  it("tolerates small clock skew but not a quote from the future", () => {
    assert.equal(freshnessOf(-2_000), "live")
    assert.equal(freshnessOf(-60_000), "stale")
    assert.equal(freshnessOf(Number.NaN), "stale")
  })
  it("labels age", () => {
    assert.equal(agoLabel(4_000), "4s ago")
    assert.equal(agoLabel(75_000), "1m ago")
    assert.equal(ageOf(ago(5000), NOW), 5000)
  })
})

describe("quote normalization", () => {
  it("uses the mid of best bid/ask, with spread", () => {
    const q = normalizeQuote(raw({ bid: 0.4, ask: 0.44 }), NOW)
    assert.ok(Math.abs(q.mid! - 0.42) < 1e-9)
    assert.ok(Math.abs(q.spread! - 0.04) < 1e-9)
    assert.equal(q.confidence, "medium")
  })
  it("high confidence on a tight, fresh book", () => {
    assert.equal(normalizeQuote(raw({ bid: 0.5, ask: 0.51 }), NOW).confidence, "high")
  })
  it("never invents a mid from a one-sided or crossed book", () => {
    assert.equal(normalizeQuote(raw({ bid: null, ask: 0.6 }), NOW).mid, null)
    assert.equal(normalizeQuote(raw({ bid: 0.5, ask: null }), NOW).mid, null)
    const crossed = normalizeQuote(raw({ bid: 0.6, ask: 0.5 }), NOW)
    assert.equal(crossed.mid, null)
    assert.equal(crossed.confidence, "none")
  })
  it("rejects resolved/empty books at the 0 and 1 edges", () => {
    assert.equal(normalizeQuote(raw({ bid: 0, ask: 0 }), NOW).mid, null)
    assert.equal(normalizeQuote(raw({ bid: 1, ask: 1 }), NOW).mid, null)
  })
  it("a very wide book is unusable, a wide one is low", () => {
    assert.equal(normalizeQuote(raw({ bid: 0.1, ask: 0.9 }), NOW).confidence, "none")
    assert.equal(normalizeQuote(raw({ bid: 0.4, ask: 0.55 }), NOW).confidence, "low")
  })
  it("is as old as the OLDER of source and fetch time", () => {
    const q = normalizeQuote(raw({ sourceTs: ago(90_000), fetchedTs: ago(1000) }), NOW)
    assert.equal(q.ageMs, 90_000)
    assert.equal(q.confidence, "medium") // delayed caps confidence
    const stale = normalizeQuote(raw({ sourceTs: ago(200_000), fetchedTs: ago(1000) }), NOW)
    assert.equal(stale.confidence, "none")
  })
  it("falls back to fetch time when the source gives no timestamp", () => {
    assert.equal(normalizeQuote(raw({ sourceTs: null, fetchedTs: ago(2000) }), NOW).ageMs, 2000)
  })
  it("model feeds give a single mid at most medium confidence", () => {
    const q = normalizeQuote({ source: "espn", selection: "home", bid: null, ask: null, mid: 0.62, sourceTs: null, fetchedTs: ago(3000) }, NOW)
    assert.equal(q.mid, 0.62)
    assert.equal(q.confidence, "medium")
  })
  it("topOfBook handles unsorted ladders", () => {
    assert.deepEqual(topOfBook([{ price: "0.01" }, { price: "0.48" }, { price: "0.3" }], [{ price: "0.9" }, { price: "0.51" }]), { bid: 0.48, ask: 0.51 })
    assert.deepEqual(topOfBook([], []), { bid: null, ask: null })
  })
})

describe("pairing outcome books", () => {
  const h = (b: number, a: number) => normalizeQuote(raw({ selection: "home", bid: b, ask: a }), NOW)
  const a = (b: number, ask: number) => normalizeQuote(raw({ selection: "away", bid: b, ask }), NOW)
  it("renormalises two mids to sum to one", () => {
    const p = pairProbability(h(0.6, 0.62), a(0.4, 0.42))!
    assert.ok(Math.abs(p.homeProb - 0.61 / (0.61 + 0.41)) < 1e-9)
  })
  it("uses the complement when only the away book exists", () => {
    const p = pairProbability(undefined, a(0.3, 0.32))!
    assert.ok(Math.abs(p.homeProb - 0.69) < 1e-9)
    assert.notEqual(p.confidence, "high")
  })
  it("refuses two books that are not one market", () => {
    assert.equal(pairProbability(h(0.7, 0.72), a(0.7, 0.72)), null)
  })
  it("returns null with no usable side", () => {
    assert.equal(pairProbability(undefined, undefined), null)
    assert.equal(pairProbability(normalizeQuote(raw({ bid: null }), NOW), undefined), null)
  })
})

const view = (over: Partial<SourceProb>): SourceProb => ({ source: "polymarket", homeProb: 0.6, asOf: ago(1000), ageMs: 1000, spread: 0.02, confidence: "high", freshness: "live", ...over })

describe("source mismatch handling", () => {
  it("shows the primary when sources agree", () => {
    const o = chooseLiveOdds([view({}), view({ source: "kalshi", homeProb: 0.62 })])
    assert.equal(o.status, "ok")
    if (o.status === "ok") {
      assert.equal(o.source, "polymarket")
      assert.equal(o.mismatch, null)
      assert.equal(o.confidence, "high")
    }
  })
  it("flags a moderate gap and downgrades confidence", () => {
    const o = chooseLiveOdds([view({}), view({ source: "kalshi", homeProb: 0.48 })])
    assert.equal(o.status, "ok")
    if (o.status === "ok") {
      assert.equal(o.confidence, "low")
      assert.equal(o.mismatch?.with, "kalshi")
    }
  })
  it("pauses when two order books disagree wildly", () => {
    const o = chooseLiveOdds([view({}), view({ source: "kalshi", homeProb: 0.3 })])
    assert.deepEqual(o.status === "paused" && o.reason, "sources_disagree")
  })
  it("a model that disagrees only warns", () => {
    const o = chooseLiveOdds([view({}), view({ source: "espn", homeProb: 0.3, confidence: "medium" })])
    assert.equal(o.status, "ok")
  })
  it("falls back to the next source when the primary is stale", () => {
    const o = chooseLiveOdds([view({ freshness: "stale", ageMs: 200_000 }), view({ source: "kalshi", homeProb: 0.55 })])
    assert.equal(o.status === "ok" && o.source, "kalshi")
  })
  it("pauses as stale when everything is old, and keeps the last time", () => {
    const o = chooseLiveOdds([view({ freshness: "stale", ageMs: 200_000, asOf: ago(200_000) })])
    assert.equal(o.status, "paused")
    if (o.status === "paused") {
      assert.equal(o.reason, "stale")
      assert.equal(o.lastAsOf?.getTime(), ago(200_000).getTime())
    }
  })
  it("pauses with no quote at all, and when the game is over", () => {
    assert.equal(chooseLiveOdds([]).status === "paused" && (chooseLiveOdds([]) as { reason: string }).reason, "no_quote")
    const done = chooseLiveOdds([view({})], { gameOver: true })
    assert.equal(done.status === "paused" && done.reason, "game_over")
  })
  it("delayed data is shown as delayed", () => {
    const o = chooseLiveOdds([view({ freshness: "delayed", ageMs: 60_000, confidence: "medium" })])
    assert.equal(o.status === "ok" && o.freshness, "delayed")
  })
})

describe("game matching", () => {
  const ref = { homeName: "Boston Celtics", awayName: "Detroit Pistons", startsAt: new Date("2026-10-20T19:00:00Z") }
  const cand = (id: string, teams: [string, string], startsAt: string | null) => ({ id, teams, startsAt: startsAt ? new Date(startsAt) : null })
  it("matches nicknames to full names, either listing order", () => {
    const m = matchGame(ref, [cand("a", ["Celtics", "Pistons"], "2026-10-20T19:00:00Z")])!
    assert.equal(m.homeIndex, 0)
    const m2 = matchGame(ref, [cand("a", ["Pistons", "Celtics"], "2026-10-20T19:00:00Z")])!
    assert.equal(m2.homeIndex, 1)
    assert.deepEqual(orientScore(10, 20, m2.homeIndex), { home: 20, away: 10 })
  })
  it("needs both teams", () => {
    assert.equal(matchGame(ref, [cand("a", ["Celtics", "Knicks"], "2026-10-20T19:00:00Z")]), null)
  })
  it("does not match on city alone", () => {
    assert.equal(sameTeam("Los Angeles Lakers", "Los Angeles Clippers"), false)
    assert.equal(sameTeam("New York Knicks", "New York Giants"), false)
    // A bare one-word suffix of several teams needs the full name.
    assert.equal(sameTeam("Virginia", "West Virginia"), false)
    assert.equal(sameTeam("Carolina", "North Carolina"), false)
    assert.equal(sameTeam("West Virginia", "West Virginia"), true)
    assert.equal(sameTeam("Celtics", "Boston Celtics"), true)
    assert.equal(sameTeam("Portland Trail Blazers", "Trail Blazers"), true)
    assert.equal(sameTeam("Novak Djokovic", "Djokovic"), true)
  })
  it("rejects a different day and honours tolerance", () => {
    assert.equal(matchGame(ref, [cand("a", ["Celtics", "Pistons"], "2026-10-21T19:00:00Z")]), null)
    assert.ok(matchGame(ref, [cand("a", ["Celtics", "Pistons"], "2026-10-20T20:30:00Z")]))
  })
  it("requires a start time unless told otherwise", () => {
    assert.equal(matchGame(ref, [cand("a", ["Celtics", "Pistons"], null)]), null)
    assert.ok(matchGame(ref, [cand("a", ["Celtics", "Pistons"], null)], { requireTime: false }))
  })
  it("refuses an ambiguous pair but picks the clearly closer start", () => {
    const two = [cand("a", ["Celtics", "Pistons"], "2026-10-20T19:05:00Z"), cand("b", ["Celtics", "Pistons"], "2026-10-20T19:20:00Z")]
    assert.equal(matchGame(ref, two), null)
    const clear = [cand("a", ["Celtics", "Pistons"], "2026-10-20T19:05:00Z"), cand("b", ["Celtics", "Pistons"], "2026-10-20T21:30:00Z")]
    assert.equal(matchGame(ref, clear)?.candidate.id, "a")
    assert.equal(matchGame(ref, [cand("a", ["Celtics", "Pistons"], null), cand("b", ["Celtics", "Pistons"], null)], { requireTime: false }), null)
  })
  it("loose mode takes a city name but never guesses between two teams in one city", () => {
    const k = [cand("k", ["Boston", "Detroit"], null)]
    assert.equal(matchGame(ref, k, { requireTime: false }), null)
    assert.ok(matchGame(ref, k, { requireTime: false, loose: true }))
    const la = { homeName: "Los Angeles Lakers", awayName: "Los Angeles Clippers", startsAt: ref.startsAt }
    assert.equal(matchGame(la, [cand("k", ["Los Angeles", "Los Angeles"], null)], { requireTime: false, loose: true }), null)
  })
  it("normalises accents and punctuation", () => {
    assert.equal(normName("São Paulo F.C."), "sao paulo")
  })
})

/* ---------- recorded-shape payloads ---------- */

const TOK = ["111", "222"] as const
const gamma = (over: Record<string, unknown> = {}) => [
  {
    slug: "nba-bos-det-2026-10-20",
    title: "Celtics vs. Pistons",
    live: true,
    ended: false,
    score: "54-50",
    period: "Q2",
    elapsed: "05:12",
    startTime: "2026-10-20T19:00:00Z",
    markets: [
      { sportsMarketType: "spreads", outcomes: '["Celtics","Pistons"]', clobTokenIds: '["x","y"]' },
      { sportsMarketType: "moneyline", outcomes: '["Celtics", "Pistons"]', clobTokenIds: JSON.stringify(TOK), acceptingOrders: true },
    ],
    ...over,
  },
  { slug: "nba-bos-det-2026-10-20-more-markets", title: "x", markets: [{ sportsMarketType: "totals", outcomes: '["Over","Under"]', clobTokenIds: '["a","b"]' }] },
]
const book = (asset_id: string, bids: number[], asks: number[], ts: number) => ({
  asset_id,
  timestamp: String(ts),
  bids: bids.map((p) => ({ price: String(p), size: "10" })),
  asks: asks.map((p) => ({ price: String(p), size: "10" })),
})

describe("Polymarket parsing", () => {
  it("keeps only plain game events with a two-team moneyline", () => {
    const games = parseGammaEvents(gamma())
    assert.equal(games.length, 1)
    assert.deepEqual(games[0]!.teams, ["Celtics", "Pistons"])
    assert.deepEqual(games[0]!.score, [54, 50])
    assert.deepEqual(games[0]!.tokens, [...TOK])
  })
  it("orients score and state to our home team", () => {
    const g = parseGammaEvents(gamma())[0]!
    const s = pmGameState(g, 1, NOW) // our home is the second-listed team
    assert.equal(s.homeScore, 50)
    assert.equal(s.awayScore, 54)
    assert.equal(s.status, "live")
    assert.equal(s.period, "Q2")
    assert.equal(s.clock, "05:12")
  })
  it("treats not-started and ended codes correctly", () => {
    const pre = parseGammaEvents(gamma({ live: false, score: null, period: "NS", elapsed: "" }))[0]!
    const s = pmGameState(pre, 0, NOW)
    assert.equal(s.status, "pre")
    assert.equal(s.period, null)
    assert.equal(pmGameState(parseGammaEvents(gamma({ ended: true }))[0]!, 0, NOW).status, "final")
  })
  it("tolerates junk", () => {
    assert.deepEqual(parseGammaEvents(null), [])
    assert.deepEqual(parseGammaEvents([{ slug: "s", markets: [{ sportsMarketType: "moneyline", outcomes: "not json" }] }]), [])
    assert.deepEqual(parseGammaEvents([{ slug: "s", markets: [{ sportsMarketType: "moneyline", outcomes: '["Yes","No"]', clobTokenIds: '["1","2"]' }] }]), [])
  })
  it("parses a CLOB book and builds oriented raw quotes from a batch", () => {
    const b = parseClobBook(book("111", [0.01, 0.55, 0.3], [0.9, 0.57], 1_792_259_535_311))!
    assert.equal(b.bid, 0.55)
    assert.equal(b.ask, 0.57)
    assert.equal(b.ts?.getTime(), 1_792_259_535_311)
    const g = parseGammaEvents(gamma())[0]!
    const qs = pmQuotes(g, 0, [book("111", [0.55], [0.57], 1), book("222", [0.43], [0.45], 1)], NOW)
    assert.deepEqual(qs.map((q) => [q.selection, q.bid, q.ask]), [["home", 0.55, 0.57], ["away", 0.43, 0.45]])
    const swapped = pmQuotes(g, 1, [book("111", [0.55], [0.57], 1), book("222", [0.43], [0.45], 1)], NOW)
    assert.deepEqual(swapped.map((q) => [q.selection, q.bid]), [["home", 0.43], ["away", 0.55]])
  })
  it("a token missing from the response gives no quote", () => {
    const g = parseGammaEvents(gamma())[0]!
    assert.equal(pmQuotes(g, 0, [book("111", [0.5], [0.52], 1)], NOW).length, 1)
  })
})

describe("Polymarket WebSocket reducer", () => {
  it("folds book, best_bid_ask and price_change messages", () => {
    const books = new Map<string, WsBook>()
    applyWsMessage(books, [{ event_type: "book", asset_id: "A", timestamp: "1000", bids: [{ price: "0.4" }, { price: "0.45" }], asks: [{ price: "0.5" }] }])
    assert.deepEqual([books.get("A")!.bid, books.get("A")!.ask], [0.45, 0.5])
    applyWsMessage(books, { event_type: "best_bid_ask", asset_id: "A", best_bid: "0.46", best_ask: "0.49", timestamp: "2000" })
    assert.deepEqual([books.get("A")!.bid, books.get("A")!.ask, books.get("A")!.ts.getTime()], [0.46, 0.49, 2000])
    const touched = applyWsMessage(books, { event_type: "price_change", timestamp: "3000", price_changes: [{ asset_id: "A", best_bid: "0.47" }, { asset_id: "B", best_bid: "0.1", best_ask: "0.2" }] })
    assert.deepEqual(touched, ["A", "B"])
    assert.deepEqual([books.get("A")!.bid, books.get("A")!.ask], [0.47, 0.49])
  })
  it("ignores unknown events and junk", () => {
    const books = new Map<string, WsBook>()
    assert.deepEqual(applyWsMessage(books, { event_type: "last_trade_price", asset_id: "A", price: "0.9" }), [])
    assert.deepEqual(applyWsMessage(books, [null, "x", 3]), [])
    assert.equal(books.size, 0)
  })
})

describe("Kalshi and ESPN parsing", () => {
  const kal = {
    events: [
      {
        event_ticker: "KXNBAGAME-26OCT20BOSDET",
        title: "Boston vs Detroit",
        markets: [
          { ticker: "T-BOS", yes_sub_title: "Boston", yes_bid_dollars: "0.60", yes_ask_dollars: "0.62" },
          { ticker: "T-DET", yes_sub_title: "Detroit", yes_bid_dollars: "0.38", yes_ask_dollars: "0.40", updated_time: "2026-09-01T00:00:00Z" },
        ],
      },
      { event_ticker: "E2", title: "HOU Texans vs JAC Jaguars", markets: [{ ticker: "a", yes_sub_title: "Houston" }, { ticker: "b", yes_sub_title: "Jacksonville" }] },
    ],
  }
  it("parses events, drops the abbreviation token, and ignores updated_time for freshness", () => {
    const games = parseKalshiEvents(kal)
    assert.deepEqual(games[1]!.teams, ["Texans", "Jaguars"])
    const m = matchGame({ homeName: "Detroit Pistons", awayName: "Boston Celtics", startsAt: NOW }, games, { requireTime: false, loose: true })!
    const qs = kalshiQuotes(m.candidate, "Detroit Pistons", "Boston Celtics", NOW)
    assert.deepEqual(qs.map((q) => [q.selection, q.bid, q.ask, q.sourceTs]), [["home", 0.38, 0.4, null], ["away", 0.6, 0.62, null]])
  })
  it("parses an ESPN scoreboard and win probability", () => {
    const board = {
      events: [{ id: "401", date: "2026-10-20T19:00Z", status: { period: 3, displayClock: "4:10", type: { state: "in" } }, competitions: [{ competitors: [{ homeAway: "away", score: "70", team: { displayName: "Detroit Pistons" } }, { homeAway: "home", score: "75", team: { displayName: "Boston Celtics" } }] }] }],
    }
    const [g] = parseEspnScoreboard(board)
    assert.deepEqual(g!.teams, ["Boston Celtics", "Detroit Pistons"])
    assert.deepEqual(g!.scores, [75, 70])
    assert.equal(g!.state, "in")
    assert.equal(espnWinProb({ winprobability: [{ homeWinPercentage: 0.5 }, { homeWinPercentage: 0.71 }] }, NOW)!.mid, 0.71)
    assert.equal(espnWinProb({ winprobability: [{ homeWinPercentage: 71 }] }, NOW)!.mid, 0.71)
    assert.equal(espnWinProb({}, NOW), null)
  })
})

describe("worker planning", () => {
  const ev = (over: Record<string, unknown>) => ({ id: "e", sport: "nba", status: "scheduled", startsAt: NOW, homeName: "A", awayName: "B", ...over }) as Parameters<typeof liveSlate>[0][number]
  it("polls only games on the field", () => {
    const slate = liveSlate(
      [
        ev({ id: "live", startsAt: ago(60 * 60_000) }),
        ev({ id: "soon", startsAt: new Date(NOW.getTime() + 3 * 60_000) }),
        ev({ id: "later", startsAt: new Date(NOW.getTime() + 60 * 60_000) }),
        ev({ id: "old", startsAt: ago(6 * 3600_000) }),
        ev({ id: "final", status: "final", startsAt: ago(60 * 60_000) }),
        ev({ id: "ppd", status: "postponed", startsAt: ago(60 * 60_000) }),
      ],
      NOW,
    )
    assert.deepEqual(slate.map((e) => e.id), ["live", "soon"])
  })
  it("sleeps longer when idle", () => {
    assert.equal(pollDelay(0), 30_000)
    assert.equal(pollDelay(3), 10_000)
  })
  it("writes every tick by default, and honours an explicit heartbeat window", () => {
    const at = ago(5000)
    assert.equal(shouldWrite(undefined, { bid: 0.5, ask: 0.52 }, NOW), true)
    assert.equal(shouldWrite({ bid: 0.5, ask: 0.52, at }, { bid: 0.5, ask: 0.52 }, NOW), true)
    assert.equal(shouldWrite({ bid: 0.5, ask: 0.52, at }, { bid: 0.5, ask: 0.52 }, NOW, 15_000), false)
    assert.equal(shouldWrite({ bid: 0.5, ask: 0.52, at }, { bid: 0.51, ask: 0.52 }, NOW, 15_000), true)
    assert.equal(shouldWrite({ bid: 0.5, ask: 0.52, at: ago(16_000) }, { bid: 0.5, ask: 0.52 }, NOW, 15_000), true)
  })
  it("idle sleep: until 10 min before the next start, capped at 15 min, floored at 30s", () => {
    const at = (min: number) => new Date(NOW.getTime() + min * 60_000)
    assert.equal(idleSleepMs(NOW, null), 15 * 60_000)
    assert.equal(idleSleepMs(NOW, at(600)), 15 * 60_000)
    assert.equal(idleSleepMs(NOW, at(20)), 10 * 60_000)
    assert.equal(idleSleepMs(NOW, at(11)), 60_000)
    assert.equal(idleSleepMs(NOW, at(5)), 30_000)
    assert.equal(idleSleepMs(NOW, at(-5)), 30_000)
  })
  it("worst-case displayed age stays comfortably under the 30s live cutoff", () => {
    assert.ok(WORST_CASE_AGE_MS <= LIVE_MAX_MS - 2_000, `worst case ${WORST_CASE_AGE_MS}ms`)
    // Simulate a view cached at its worst point and re-aged: still "live".
    const q = (sel: string, bid: number, ask: number) => ({ market: "moneyline", selection: sel, source: "polymarket", bid, ask, mid: (bid + ask) / 2, sourceTs: ago(PIPELINE.bookMs), fetchedTs: ago(PIPELINE.bookMs) })
    const base = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [q("home", 0.6, 0.62), q("away", 0.38, 0.4)], state: null }, ago(0))
    const lag = PIPELINE.tickMs + PIPELINE.cycleMs + PIPELINE.apiCacheMs + PIPELINE.cdnMs + PIPELINE.clientPollMs
    const shown = ageView(base, lag)
    assert.equal(shown.odds.status === "ok" && shown.odds.freshness, "live")
    // And a view that sat too long is paused, not shown live.
    assert.equal(ageView(base, 150_000).odds.status, "paused")
  })
  it("tracks book changes and, in fetch mode, treats an unchanged quiet book as live", () => {
    const t0 = new Date("2026-10-18T20:00:00Z")
    const t1 = new Date(t0.getTime() + 10_000)
    const old = new Date(t0.getTime() - 90_000)
    const first = bookClock(undefined, { sourceTs: old, bid: 0.5, ask: 0.52 }, t0, "strict")
    assert.equal(first.quiet, false) // first sight: unknown, not yet "unchanged"
    const second = bookClock(first.clock, { sourceTs: old, bid: 0.5, ask: 0.52 }, t1, "strict")
    assert.equal(second.quiet, true)
    assert.equal(second.sourceTs?.getTime(), old.getTime()) // strict keeps the source stamp
    assert.equal(second.changeAgeMs, 10_000)
    const fetchMode = bookClock(first.clock, { sourceTs: old, bid: 0.5, ask: 0.52 }, t1, "fetch")
    assert.equal(fetchMode.sourceTs, null)
    // A changed book is never quiet, whichever mode.
    assert.equal(bookClock(first.clock, { sourceTs: old, bid: 0.51, ask: 0.52 }, t1, "fetch").quiet, false)
    // A timestamp that tracks the fetch (snapshot semantics) is never quiet.
    const snap = bookClock(undefined, { sourceTs: t0, bid: 0.5, ask: 0.52 }, t0, "fetch")
    assert.equal(bookClock(snap.clock, { sourceTs: t1, bid: 0.5, ask: 0.52 }, t1, "fetch").quiet, false)
  })
})

describe("public endpoint helpers", () => {
  it("rate limiter allows max per window per key and resets", () => {
    const l = createMemoryLimiter(3, 60_000)
    assert.deepEqual([1, 2, 3, 4].map(() => l.take("ip", 1000)), [true, true, true, false])
    assert.equal(l.take("other", 1000), true)
    assert.equal(l.take("ip", 61_000), true)
  })
  it("negative results get their own longer ttl", async () => {
    const c = createTtlCache<number | null>(1000)
    let n = 0
    const load = async () => (++n, null)
    const ttl = (v: number | null) => (v ? 1000 : 60_000)
    await c.getMeta("k", 0, load, ttl)
    const again = await c.getMeta("k", 30_000, load, ttl)
    assert.deepEqual([again.hit, n], [true, 1])
    assert.equal((await c.getMeta("k", 61_000, load, ttl)).hit, false)
  })
  it("client ip comes from the first forwarded hop", () => {
    assert.equal(clientIp({ get: (h: string) => (h === "x-forwarded-for" ? "1.2.3.4, 5.6.7.8" : null) }), "1.2.3.4")
    assert.equal(clientIp({ get: () => null }), "unknown")
  })
})

describe("why a game did not match", () => {
  const ref = { homeName: "Boston Celtics", awayName: "Detroit Pistons", startsAt: new Date("2026-10-20T19:00:00Z") }
  const c = (teams: [string, string], startsAt: string | null) => ({ id: "x", teams, startsAt: startsAt ? new Date(startsAt) : null })
  it("explains each failure", () => {
    assert.equal(explainNoMatch(ref, []), "feed_has_no_games")
    assert.equal(explainNoMatch(ref, [c(["Lakers", "Suns"], "2026-10-20T19:00:00Z")]), "no_name_match")
    assert.equal(explainNoMatch(ref, [c(["Celtics", "Suns"], "2026-10-20T19:00:00Z")]), "only_one_team_matches")
    assert.match(explainNoMatch(ref, [c(["Celtics", "Pistons"], "2026-10-23T19:00:00Z")]), /^time_outside_tolerance\(gap_min=4320\)$/)
    assert.equal(explainNoMatch(ref, [c(["Celtics", "Pistons"], "2026-10-20T19:05:00Z"), c(["Pistons", "Celtics"], "2026-10-20T19:10:00Z")]), "ambiguous_candidates")
  })
})

describe("retention policy", () => {
  const key = "e|moneyline|home|polymarket"
  const row = (id: number, ageMs: number, k = key) => ({ id, key: k, at: ago(ageMs) })
  it("keeps everything recent, thins the middle, keeps latest per key, purges the very old", () => {
    const min = 60_000
    const rows = [
      row(1, 1 * min), // recent
      row(2, 20 * min), // recent
      // 40-44 min ago: same 5-minute bucket mostly; only the newest of each bucket survives
      row(3, 40 * min),
      row(4, 41 * min),
      row(5, 42 * min),
      row(6, 4 * 24 * 3600_000), // older than the coarse window, not latest
      row(7, 31 * 24 * 3600_000, "other|moneyline|home|kalshi"), // only row of its key but past the purge age
      row(8, 5 * 24 * 3600_000, "old|moneyline|home|kalshi"), // latest of its key, kept
    ]
    const kept = survivors(rows, NOW)
    assert.ok(kept.has(1) && kept.has(2))
    const b = retentionCutoffs(NOW).bucketSeconds
    const bucketOf = (r: { at: Date }) => Math.floor(r.at.getTime() / 1000 / b)
    const mid = rows.filter((r) => [3, 4, 5].includes(r.id))
    const buckets = new Set(mid.map(bucketOf))
    assert.equal(mid.filter((r) => kept.has(r.id)).length, buckets.size)
    assert.ok(!kept.has(6))
    assert.ok(!kept.has(7))
    assert.ok(kept.has(8))
  })
  it("cutoffs are ordered", () => {
    const c = retentionCutoffs(NOW)
    assert.ok(c.purgeBefore < c.coarseBefore && c.coarseBefore < c.rawBefore && c.rawBefore < NOW)
  })
})

describe("served view", () => {
  const q = (selection: string, bid: number, ask: number, over: Record<string, unknown> = {}) => ({
    market: "moneyline",
    selection,
    source: "polymarket",
    bid,
    ask,
    mid: (bid + ask) / 2,
    sourceTs: ago(1500),
    fetchedTs: ago(1000),
    ...over,
  })
  const st = { status: "live", homeScore: 54, awayScore: 50, period: "Q2", clock: "05:12", source: "polymarket", sourceTs: null, fetchedTs: ago(2000) }
  it("combines quotes and state into win probability, score and freshness", () => {
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [q("home", 0.6, 0.62), q("away", 0.38, 0.4)], state: st }, NOW)
    assert.equal(v.status, "live")
    assert.deepEqual(v.score, { home: 54, away: 50 })
    assert.equal(v.odds.status, "ok")
    if (v.odds.status === "ok") {
      assert.equal(v.odds.freshness, "live")
      assert.ok(Math.abs(v.odds.homeProb + v.odds.awayProb - 1) < 1e-9)
      assert.equal(v.odds.source, "polymarket")
    }
    assert.equal(v.stateFreshness, "live")
  })
  it("keeps source price age separate from the oldest new worker observation", () => {
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [q("home", 0.6, 0.62, { fetchedTs: ago(100) }), q("away", 0.38, 0.4, { fetchedTs: ago(800) })], state: st }, NOW)
    assert.equal(v.odds.status, "ok")
    if (v.odds.status === "ok") {
      assert.equal(v.odds.asOf, ago(1500).toISOString())
      assert.equal(v.odds.observedAsOf, ago(800).toISOString())
    }
  })
  it("hides odds once the quote is stale but still shows the score", () => {
    const old = { sourceTs: ago(300_000), fetchedTs: ago(299_000) }
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [q("home", 0.6, 0.62, old), q("away", 0.38, 0.4, old)], state: st }, NOW)
    assert.equal(v.odds.status === "paused" && v.odds.reason, "stale")
    assert.ok(v.odds.status === "paused" && v.odds.lastAsOf)
    assert.deepEqual(v.score, { home: 54, away: 50 })
  })
  it("pauses odds and says final when the game is over", () => {
    const v = buildLiveView({ eventId: "e", eventStatus: "final", quotes: [q("home", 0.99, 1)], state: st }, NOW)
    assert.equal(v.status, "final")
    assert.equal(v.odds.status === "paused" && v.odds.reason, "game_over")
  })
  it("with no data at all is a quiet paused view", () => {
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [], state: null }, NOW)
    assert.equal(v.status, "unknown")
    assert.equal(v.score, null)
    assert.equal(v.odds.status === "paused" && v.odds.reason, "no_quote")
  })
  it("uses ESPN's single number when it is the only source", () => {
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [{ market: "moneyline", selection: "home", source: "espn", bid: null, ask: null, mid: 0.7, sourceTs: null, fetchedTs: ago(4000) }], state: null }, NOW)
    assert.equal(v.odds.status === "ok" && v.odds.source, "espn")
  })
  it("ignores unknown sources, markets and selections", () => {
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [q("home", 0.6, 0.62, { source: "mystery" }), q("home", 0.6, 0.62, { market: "spread" })], state: null }, NOW)
    assert.equal(v.odds.status, "paused")
  })
})

describe("display wording", () => {
  const live = (ageMs: number) =>
    buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [{ market: "moneyline", selection: "home", source: "polymarket", bid: 0.6, ask: 0.62, mid: 0.61, sourceTs: ago(ageMs), fetchedTs: ago(ageMs) }, { market: "moneyline", selection: "away", source: "polymarket", bid: 0.38, ask: 0.4, mid: 0.39, sourceTs: ago(ageMs), fetchedTs: ago(ageMs) }], state: null }, NOW)
  it("chip: live, delayed, paused, and the browser's own elapsed time counts", () => {
    assert.equal(chipFor(live(2000), 0).label, "Live")
    assert.equal(chipFor(live(45_000), 0).label, "Delayed")
    assert.equal(chipFor(live(200_000), 0).label, "Odds paused")
    assert.equal(chipFor(live(20_000), 15_000).label, "Delayed")
    assert.equal(chipFor(live(20_000), 200_000).label, "Odds paused")
    assert.equal(chipFor(null, 0).tone, "waiting")
  })
  it("percentages add to 100 and never show 0 or 100", () => {
    assert.deepEqual(splitPct(0.614), { home: 61, away: 39 })
    assert.deepEqual(splitPct(0.999), { home: 99, away: 1 })
    assert.deepEqual(splitPct(0.001), { home: 1, away: 99 })
  })
  it("status line", () => {
    const v = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [], state: { status: "live", homeScore: 1, awayScore: 0, period: "Q3", clock: "02:10", source: "polymarket", sourceTs: null, fetchedTs: ago(1) } }, NOW)
    assert.equal(statusLine(v), "Q3 02:10")
  })
})

describe("ttl cache", () => {
  it("serves within the ttl, shares in-flight loads, and reloads after", async () => {
    const c = createTtlCache<number>(5000)
    let n = 0
    const load = async () => ++n
    const [a, b] = await Promise.all([c.get("k", 1000, load), c.get("k", 1000, load)])
    assert.deepEqual([a, b, n], [1, 1, 1])
    assert.equal(await c.get("k", 5999, load), 1)
    assert.equal(await c.get("k", 6001, load), 2)
  })
})
