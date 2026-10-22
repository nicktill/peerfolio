import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { priceTwoWay } from "../odds.ts"
import { REPRICE, type MarketState, type RepriceStore, type RepriceTarget } from "../reprice.ts"
import { runRepricePass } from "./reprice-pass.ts"
import { newWorkerState, type WorkerDeps } from "./worker.ts"

const START = new Date("2026-10-20T19:00:00Z")
const NOW = new Date(START.getTime() - 60 * 60_000)
const plus = (ms: number) => new Date(NOW.getTime() + ms)
const BASIS = 0.55

const state = (over: Partial<MarketState> = {}): MarketState => ({
  kind: "moneyline",
  status: "open",
  lockAt: START,
  createdAt: plus(-3600_000),
  fairProbA: BASIS,
  pointA: null,
  prices: priceTwoWay(BASIS)!,
  repricedAt: null,
  repriceCount: 0,
  exchangeOkAt: plus(-60_000),
  history: [],
  ...over,
})
const target = (over: Partial<RepriceTarget> = {}): RepriceTarget => ({ marketId: "m1", eventId: "ev1", sport: "nba", homeName: "Boston Celtics", awayName: "Detroit Pistons", startsAt: START, eventStatus: "scheduled", state: state(), ...over })

const gamma = (live = false) => [
  {
    slug: "nba-det-bos",
    live,
    ended: false,
    startTime: START.toISOString(),
    markets: [{ sportsMarketType: "moneyline", outcomes: '["Pistons","Celtics"]', clobTokenIds: '["t-det","t-bos"]', acceptingOrders: true }],
  },
]
const book = (id: string, mid: number, half = 0.01, size = "1000") => ({ asset_id: id, timestamp: String(NOW.getTime() - 500), bids: [{ price: String(mid - half), size }], asks: [{ price: String(mid + half), size }] })

function harness(targets: RepriceTarget[], opts: { celticsMid?: number; half?: number; size?: string; live?: boolean; kalshi?: unknown } = {}) {
  const applied: { marketId: string; basis: number | null; prices: number[] }[] = []
  const frozen: { marketId: string; reason: string }[] = []
  const confirmed: string[][] = []
  const reopened: string[] = []
  const lines: { level: string; ev: string; f: Record<string, unknown> }[] = []
  const calls: string[] = []
  const store: RepriceStore = {
    listTargets: async () => targets,
    apply: async (marketId, expected, d) => {
      applied.push({ marketId, basis: expected.basis, prices: d.prices })
      return { applied: true, oldPrices: targets[0]!.state.prices, newPrices: d.prices, version: 2 }
    },
    freeze: async (marketId, reason) => {
      frozen.push({ marketId, reason })
      return true
    },
    confirm: async (ids) => void confirmed.push(ids),
    reopen: async (marketId) => {
      reopened.push(marketId)
      return true
    },
  }
  const mid = opts.celticsMid ?? 0.58
  const deps: WorkerDeps = {
    store: { loadSlate: async () => [], insertQuotes: async () => {}, upsertState: async () => {} },
    reprice: store,
    getJson: async (u) => {
      calls.push(u)
      if (u.includes("gamma-api")) return gamma(opts.live)
      if (u.includes("kalshi")) return opts.kalshi ?? { events: [] }
      throw new Error(`unexpected ${u}`)
    },
    postJson: async (u, body) => {
      calls.push(`POST ${u}`)
      return (body as { token_id: string }[]).map(({ token_id }) => book(token_id, token_id === "t-bos" ? mid : 1 - mid, opts.half, opts.size))
    },
    emit: (level, ev, f) => void lines.push({ level, ev, f: f ?? {} }),
  }
  return { deps, applied, frozen, confirmed, reopened, lines, calls }
}

describe("pregame repricing pass", () => {
  it("reprices an open market from the exchange mid and logs old/new price, source, spread and age", async () => {
    const h = harness([target()])
    const r = await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.equal(r?.updated, 1)
    assert.deepEqual(h.applied[0], { marketId: "m1", basis: BASIS, prices: priceTwoWay(0.58)! })
    const line = h.lines.find((l) => l.ev === "sports.line_repriced")!
    assert.equal(line.level, "info")
    assert.deepEqual(line.f.newPrices, priceTwoWay(0.58))
    assert.equal(line.f.source, "polymarket")
    assert.equal(line.f.spread, 0.02)
    assert.equal(typeof line.f.ageMs, "number")
    assert.equal(line.f.startsInMin, 60)
  })

  it("scales with games: one Gamma list and one batched books call for any number of markets", async () => {
    const h = harness([target(), target({ marketId: "m2" })])
    await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.equal(h.calls.filter((c) => c.includes("gamma-api")).length, 1)
    assert.equal(h.calls.filter((c) => c.startsWith("POST")).length, 1)
  })

  it("does nothing for a small move except confirm the exchange (throttled)", async () => {
    const h = harness([target({ state: state({ exchangeOkAt: plus(-10 * 60_000) }) })], { celticsMid: BASIS + 0.005 })
    const r = await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.equal(r?.updated, 0)
    assert.deepEqual(h.confirmed, [["m1"]])
    const h2 = harness([target({ state: state({ exchangeOkAt: plus(-30_000) }) })], { celticsMid: BASIS + 0.005 })
    await runRepricePass(h2.deps, newWorkerState(), NOW)
    assert.deepEqual(h2.confirmed, [])
  })

  it("holds on a wide book and logs why, and freezes a managed market on a jump", async () => {
    const wide = harness([target()], { half: 0.05 })
    const r = await runRepricePass(wide.deps, newWorkerState(), NOW)
    assert.equal(r?.updated, 0)
    assert.equal(wide.lines.find((l) => l.ev === "live.reprice_hold")?.f.reason, "book too wide")
    const jump = harness([target()], { celticsMid: BASIS + 0.1 })
    await runRepricePass(jump.deps, newWorkerState(), NOW)
    assert.deepEqual(jump.frozen, [{ marketId: "m1", reason: "exchange jump" }])
    assert.equal(jump.lines.find((l) => l.ev === "sports.market_frozen_exchange")?.level, "warn")
  })

  it("holds on a thin top of book, even with a tight spread", async () => {
    const h = harness([target()], { size: "50" })
    const r = await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.equal(r?.updated, 0)
    assert.equal(h.lines.find((l) => l.ev === "live.reprice_hold")?.f.reason, "book too thin")
  })

  it("freezes when the exchange shows the game already in play before the scheduled start", async () => {
    const h = harness([target()], { live: true })
    await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.match(h.frozen[0]!.reason, /in play/)
    assert.equal(h.applied.length, 0)
  })

  it("holds when Kalshi disagrees with Polymarket by more than 5 points", async () => {
    const kalshi = { events: [{ event_ticker: "K", title: "Detroit vs Boston", markets: [{ ticker: "a", yes_sub_title: "Boston", yes_bid_dollars: "0.49", yes_ask_dollars: "0.51" }, { ticker: "b", yes_sub_title: "Detroit", yes_bid_dollars: "0.49", yes_ask_dollars: "0.51" }] }] }
    const h = harness([target()], { kalshi })
    await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.equal(h.applied.length, 0)
    assert.equal(h.lines.find((l) => l.ev === "live.reprice_hold")?.f.reason, "sources disagree")
  })

  it("Kalshi is a cross-check: it never reprices alone (no sizes), agreeing sources reprice", async () => {
    const kalshi = { events: [{ event_ticker: "K", title: "Detroit vs Boston", markets: [{ ticker: "a", yes_sub_title: "Boston", yes_bid_dollars: "0.57", yes_ask_dollars: "0.59" }, { ticker: "b", yes_sub_title: "Detroit", yes_bid_dollars: "0.41", yes_ask_dollars: "0.43" }] }] }
    const agree = harness([target()], { kalshi })
    await runRepricePass(agree.deps, newWorkerState(), NOW)
    assert.equal(agree.applied.length, 1)
    const only = harness([target({ homeName: "Boston Celtics", awayName: "Detroit Pistons" })], { kalshi })
    only.deps.getJson = async (u) => (u.includes("gamma-api") ? [] : u.includes("kalshi") ? kalshi : (() => { throw new Error(u) })())
    const r = await runRepricePass(only.deps, newWorkerState(), NOW)
    assert.equal(r?.updated, 0)
    assert.equal(only.lines.find((l) => l.ev === "live.reprice_hold")?.f.reason, "book too thin")
  })

  it("an unmatched market keeps its current behaviour: nothing written, nothing frozen", async () => {
    const h = harness([target({ homeName: "Los Angeles Lakers", awayName: "Phoenix Suns", state: state({ exchangeOkAt: null }) })])
    const r = await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.equal(r?.unmatched, 1)
    assert.deepEqual([h.applied.length, h.frozen.length], [0, 0])
  })

  it("never reprices at or after kickoff (the pass itself is time-gated by the decision)", async () => {
    const h = harness([target({ startsAt: NOW })])
    await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.equal(h.applied.length, 0)
  })

  it("cadence: skipped until due, fast inside the window and slow outside it", async () => {
    const st = newWorkerState()
    const h = harness([target()])
    assert.equal((await runRepricePass(h.deps, st, NOW))?.skipped, false)
    const again = await runRepricePass(h.deps, st, plus(10_000))
    assert.equal(again?.skipped, true)
    assert.equal(again?.nextPassMs, REPRICE.passMs - 10_000)
    assert.equal((await runRepricePass(h.deps, st, plus(REPRICE.passMs))) ?.skipped, false)
    const far = harness([target({ startsAt: new Date(NOW.getTime() + 8 * 3600_000) })])
    const st2 = newWorkerState()
    const t0 = new Date("2026-10-20T18:02:00Z")
    await runRepricePass(far.deps, st2, t0)
    const next = await runRepricePass(far.deps, st2, new Date(t0.getTime() + 60_000))
    assert.equal(next?.skipped, true)
    assert.equal(next?.nextPassMs, 13 * 60_000 + 45_000 - 60_000, "waits for the 18:15:45 slot")
  })

  it("no targets: no upstream call", async () => {
    const h = harness([])
    await runRepricePass(h.deps, newWorkerState(), NOW)
    assert.deepEqual(h.calls, [])
  })

  describe("markets frozen for a dead worker", () => {
    const locked = (over: Partial<MarketState> = {}) => target({ state: state({ status: "locked", exchangeOkAt: plus(-5 * 3600_000), ...over }) })

    it("reopens and reprices only after a healthy exchange read, even though the old confirmation is hours old", async () => {
      const h = harness([locked()], { celticsMid: BASIS + 0.02 })
      await runRepricePass(h.deps, newWorkerState(), NOW)
      assert.deepEqual(h.reopened, ["m1"])
      assert.equal(h.applied.length, 1)
    })

    it("reopens a market whose price did not move, and stamps it", async () => {
      const h = harness([locked()], { celticsMid: BASIS + 0.005 })
      await runRepricePass(h.deps, newWorkerState(), NOW)
      assert.deepEqual(h.reopened, ["m1"])
      assert.deepEqual(h.confirmed, [["m1"]])
    })

    it("stays locked when the exchange read is unusable or the price jumped", async () => {
      const thin = harness([locked()], { size: "10" })
      await runRepricePass(thin.deps, newWorkerState(), NOW)
      assert.deepEqual([thin.reopened, thin.frozen, thin.applied], [[], [], []])
      const jump = harness([locked()], { celticsMid: BASIS + 0.2 })
      await runRepricePass(jump.deps, newWorkerState(), NOW)
      assert.deepEqual([jump.reopened, jump.applied], [[], []])
    })
  })
})

describe("pregame pass idle gating", () => {
  it("far games: one pass per slot and no database read in between", async () => {
    const far = target({ startsAt: new Date(NOW.getTime() + 8 * 3600_000) })
    let lists = 0
    const h = harness([far])
    const base = h.deps.reprice!.listTargets
    h.deps.reprice!.listTargets = async (n) => (lists++, base(n))
    const st = newWorkerState()
    const t0 = new Date("2026-10-20T18:00:50Z")
    assert.equal((await runRepricePass(h.deps, st, t0))?.skipped, false)
    assert.equal(lists, 1)
    for (const s of [1, 60, 300, 600]) {
      const r = await runRepricePass(h.deps, st, new Date(t0.getTime() + s * 1000))
      assert.equal(r?.skipped, true)
      assert.equal(r?.targets, 1)
    }
    assert.equal(lists, 1, "no database read between slots")
    assert.equal((await runRepricePass(h.deps, st, new Date("2026-10-20T18:15:46Z")))?.skipped, false)
  })

  it("wakes when the nearest game enters the fast window even mid-slot", async () => {
    const start = new Date("2026-10-20T21:05:00Z")
    const h = harness([target({ startsAt: start })])
    const st = newWorkerState()
    await runRepricePass(h.deps, st, new Date("2026-10-20T18:00:50Z"))
    const r = await runRepricePass(h.deps, st, new Date("2026-10-20T18:01:00Z"))
    assert.equal(r?.skipped, true)
    assert.ok(r!.nextPassMs <= 4 * 60_000 + 10_000, "window opens at 18:05, before the next slot")
  })

  it("near games keep the 30 second cadence without reading targets on intervening live ticks", async () => {
    const h = harness([target()])
    let lists = 0
    const base = h.deps.reprice!.listTargets
    h.deps.reprice!.listTargets = async (now) => (lists++, base(now))
    const st = newWorkerState()
    assert.equal((await runRepricePass(h.deps, st, NOW))?.skipped, false)
    const upstreamCalls = h.calls.length
    for (const ms of [10_000, 20_000, REPRICE.passMs - 1]) {
      const result = await runRepricePass(h.deps, st, plus(ms))
      assert.equal(result?.skipped, true)
      assert.equal(result?.nextPassMs, REPRICE.passMs - ms)
    }
    assert.equal(lists, 1)
    assert.equal(h.calls.length, upstreamCalls)
    assert.equal((await runRepricePass(h.deps, st, plus(REPRICE.passMs)))?.skipped, false)
    assert.equal(lists, 2)
    assert.equal(h.applied.length, 2, "prices are still checked on every due fast pass")
  })

  it("an empty target list is checked again at the fast cadence and discovers newly published markets", async () => {
    const targets: RepriceTarget[] = []
    const h = harness(targets)
    let lists = 0
    const base = h.deps.reprice!.listTargets
    h.deps.reprice!.listTargets = async (now) => (lists++, base(now))
    const st = newWorkerState()
    const empty = await runRepricePass(h.deps, st, NOW)
    assert.equal(empty?.skipped, true)
    assert.equal(empty?.nextPassMs, REPRICE.passMs)
    targets.push(target())
    for (const ms of [10_000, 20_000, REPRICE.passMs - 1]) {
      assert.equal((await runRepricePass(h.deps, st, plus(ms)))?.skipped, true)
    }
    assert.equal(lists, 1)
    assert.equal(h.calls.length, 0)
    const discovered = await runRepricePass(h.deps, st, plus(REPRICE.passMs))
    assert.equal(discovered?.targets, 1)
    assert.equal(discovered?.skipped, false)
    assert.equal(lists, 2)
    assert.equal(h.applied.length, 1)
  })

  it("a failed target-list query retries on the next tick rather than caching a failure", async () => {
    const h = harness([target()])
    let lists = 0
    h.deps.reprice!.listTargets = async () => {
      if (++lists === 1) throw new Error("database unavailable")
      return [target()]
    }
    const st = newWorkerState()
    await assert.rejects(runRepricePass(h.deps, st, NOW), /database unavailable/)
    assert.equal((await runRepricePass(h.deps, st, plus(10_000)))?.skipped, false)
    assert.equal(lists, 2)
  })
})

describe("far-market freeze tolerance", () => {
  it("one bad read between far passes does not freeze a managed market; a long outage does", async () => {
    const startsFar = new Date(NOW.getTime() + 8 * 3600_000)
    const old = (min: number) => state({ exchangeOkAt: plus(-min * 60_000) })
    const wide = (min: number) => harness([target({ startsAt: startsFar, state: old(min) })], { half: 0.05 })
    const a = wide(15)
    await runRepricePass(a.deps, newWorkerState(), NOW)
    assert.deepEqual(a.frozen, [], "15 min since the last good read is one missed far pass")
    const b = wide(40)
    await runRepricePass(b.deps, newWorkerState(), NOW)
    assert.equal(b.frozen.length, 1, "40 min without a good read freezes")
    const near = harness([target({ state: old(15) })], { half: 0.05 })
    await runRepricePass(near.deps, newWorkerState(), NOW)
    assert.equal(near.frozen.length, 1, "inside the window the 10 minute rule is unchanged")
  })
})
