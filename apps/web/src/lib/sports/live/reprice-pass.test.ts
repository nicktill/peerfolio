import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { priceTwoWay } from "../odds.ts"
import { priceNeedsRefresh, REPRICE, type MarketState, type RepriceStore, type RepriceTarget } from "../reprice.ts"
import { ACTIVITY_WINDOW_MS } from "./activity.ts"
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
    recover: async (marketId, expected, d) => {
      reopened.push(marketId)
      if (d.action === "update") applied.push({ marketId, basis: expected.basis, prices: d.prices })
      else confirmed.push([marketId])
      return { applied: true, oldPrices: targets[0]!.state.prices, newPrices: d.action === "update" ? d.prices : targets[0]!.state.prices, version: 2 }
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

    it("recovers a temporary pause across an old-price gap only when both exchanges agree", async () => {
      const t = { ...locked(), frozenReason: "line moved" }
      const single = harness([t], { celticsMid: BASIS + 0.07 })
      await runRepricePass(single.deps, newWorkerState(), NOW)
      assert.deepEqual(single.reopened, [])
      // Kalshi fixture uses the home YES market and independently agrees with Polymarket.
      const cross = harness([t], { celticsMid: BASIS + 0.07, kalshi: { events: [{ event_ticker: "KXNBAGAME-26OCT20DETBOS", title: "Detroit vs Boston", markets: [
        { ticker: "DET", yes_sub_title: "Detroit", yes_bid_dollars: "0.37", yes_ask_dollars: "0.39", close_time: START.toISOString() },
        { ticker: "BOS", yes_sub_title: "Boston", yes_bid_dollars: "0.61", yes_ask_dollars: "0.63", close_time: START.toISOString() },
      ] }] } })
      await runRepricePass(cross.deps, newWorkerState(), NOW)
      assert.deepEqual(cross.reopened, ["m1"])
      const open = harness([{ ...t, state: { ...t.state, status: "open" } }], { celticsMid: BASIS + 0.07, kalshi: await cross.deps.getJson("https://kalshi.test") })
      await runRepricePass(open.deps, newWorkerState(), NOW)
      assert.deepEqual(open.reopened, [])
      assert.equal(open.frozen[0]?.reason, "exchange jump", "open-market step guard is unchanged")
      const farCross = JSON.parse(JSON.stringify(await cross.deps.getJson("https://kalshi.test")).replaceAll('"0.61"', '"0.74"').replaceAll('"0.63"', '"0.76"').replaceAll('"0.37"', '"0.24"').replaceAll('"0.39"', '"0.26"'))
      const tooFar = harness([t], { celticsMid: BASIS + 0.2, kalshi: farCross })
      await runRepricePass(tooFar.deps, newWorkerState(), NOW)
      assert.deepEqual(tooFar.reopened, [])
    })
    it("does not use a separate reopen followed by an ordinary price write", async () => {
      const h = harness([locked()], { celticsMid: BASIS + 0.02 })
      h.deps.reprice!.apply = async () => { throw new Error("must use atomic recovery") }
      await runRepricePass(h.deps, newWorkerState(), NOW)
      assert.deepEqual(h.reopened, ["m1"])
    })
    it("a failed atomic recovery leaves the market held without a second write", async () => {
      const h = harness([locked()], { celticsMid: BASIS + 0.02 })
      h.deps.reprice!.recover = async () => ({ applied: false, reason: "basis changed" })
      const r = await runRepricePass(h.deps, newWorkerState(), NOW)
      assert.equal(r!.held, 1)
      assert.deepEqual([h.reopened, h.applied, h.confirmed], [[], [], []])
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

describe("activity-gated cadence", () => {
  const withActivity = (h: ReturnType<typeof harness>, at: () => Date | null) => {
    h.deps.reprice!.lastActivity = async () => at()
    let lists = 0
    const base = h.deps.reprice!.listTargets
    h.deps.reprice!.listTargets = async (now) => (lists++, base(now))
    return () => lists
  }
  const slotted = new Date("2026-10-20T18:02:00Z")
  const SLOT_MS = 13 * 60_000 + 45_000
  const near = () => target({ startsAt: new Date(slotted.getTime() + 60 * 60_000) })

  it("watched near games keep the 30 second pass", async () => {
    const h = harness([near()])
    withActivity(h, () => new Date(slotted.getTime() - 20_000))
    const st = newWorkerState()
    const first = await runRepricePass(h.deps, st, slotted)
    assert.equal(first?.skipped, false)
    assert.equal(first?.nextPassMs, REPRICE.passMs)
    assert.equal((await runRepricePass(h.deps, st, new Date(slotted.getTime() + REPRICE.passMs)))?.skipped, false)
  })

  it("unwatched near games are repriced once per slot with no database read in between", async () => {
    const h = harness([near()])
    const lists = withActivity(h, () => null)
    const st = newWorkerState()
    const first = await runRepricePass(h.deps, st, slotted)
    assert.equal(first?.skipped, false, "the pass itself still runs")
    assert.equal(first?.nextPassMs, SLOT_MS, "next pass is the 18:15:45 slot")
    for (const ms of [30_000, 5 * 60_000, 13 * 60_000]) {
      assert.equal((await runRepricePass(h.deps, st, new Date(slotted.getTime() + ms)))?.skipped, true)
    }
    assert.equal(lists(), 1)
    assert.equal((await runRepricePass(h.deps, st, new Date(slotted.getTime() + SLOT_MS)))?.skipped, false)
  })

  it("activity older than the window counts as unwatched", async () => {
    const h = harness([near()])
    withActivity(h, () => new Date(slotted.getTime() - ACTIVITY_WINDOW_MS - 1))
    assert.equal((await runRepricePass(h.deps, newWorkerState(), slotted))?.nextPassMs, SLOT_MS)
  })

  it("a viewer arriving mid-slot is picked up at the next slot and the fast pass resumes", async () => {
    const h = harness([near()])
    let last: Date | null = null
    withActivity(h, () => last)
    const st = newWorkerState()
    await runRepricePass(h.deps, st, slotted)
    const slot = new Date(slotted.getTime() + SLOT_MS)
    last = new Date(slot.getTime() - 60_000)
    const r = await runRepricePass(h.deps, st, slot)
    assert.equal(r?.skipped, false)
    assert.equal(r?.nextPassMs, REPRICE.passMs)
  })

  it("an unwatched near market tolerates a slot-length gap; a long outage still freezes it", async () => {
    const run = async (minutes: number) => {
      const h = harness([target({ state: state({ exchangeOkAt: plus(-minutes * 60_000) }) })], { half: 0.05 })
      withActivity(h, () => null)
      await runRepricePass(h.deps, newWorkerState(), NOW)
      return h.frozen.length
    }
    assert.equal(await run(14), 0, "14 minutes without a good read is within the slow tolerance")
    assert.equal(await run(40), 1, "40 minutes freezes")
  })

  it("watched, far games still wake when the nearest one enters the fast window", async () => {
    const h = harness([target({ startsAt: new Date(slotted.getTime() + 3 * 3600_000 + 5 * 60_000) })])
    withActivity(h, () => new Date(slotted.getTime() - 1_000))
    assert.equal((await runRepricePass(h.deps, newWorkerState(), slotted))?.nextPassMs, 5 * 60_000, "wakes at window entry, before the slot")
  })

  it("unwatched, far games do not wake for window entry", async () => {
    const h = harness([target({ startsAt: new Date(slotted.getTime() + 3 * 3600_000 + 5 * 60_000) })])
    withActivity(h, () => null)
    assert.equal((await runRepricePass(h.deps, newWorkerState(), slotted))?.nextPassMs, SLOT_MS)
  })
})

describe("priceNeedsRefresh", () => {
  const start = new Date("2026-10-20T19:00:00Z")
  const at = (minBefore: number) => new Date(start.getTime() - minBefore * 60_000)
  it("blocks only managed markets inside the window with an old exchange read", () => {
    assert.equal(priceNeedsRefresh({ exchangeOkAt: at(70) }, start, at(60)), true, "10 minutes old")
    assert.equal(priceNeedsRefresh({ exchangeOkAt: at(62) }, start, at(60)), false, "2 minutes old")
    assert.equal(priceNeedsRefresh({ exchangeOkAt: null }, start, at(60)), false, "never exchange-managed")
    assert.equal(priceNeedsRefresh({ exchangeOkAt: at(600) }, start, at(300)), false, "game still far away")
  })
})

describe("quiet-hours cadence (default SPORTS_QUIET_HOURS_UTC 5-15)", () => {
  const quiet = new Date("2026-10-22T06:02:00Z")
  const unwatched = (h: ReturnType<typeof harness>) => void (h.deps.reprice!.lastActivity = async () => null)
  const startsIn = (min: number) => new Date(quiet.getTime() + min * 60_000)

  it("games beyond the window plus an hour are read hourly", async () => {
    const h = harness([target({ startsAt: startsIn(8 * 60) })])
    unwatched(h)
    const st = newWorkerState()
    const first = await runRepricePass(h.deps, st, quiet)
    assert.equal(first?.nextPassMs, new Date("2026-10-22T07:00:45Z").getTime() - quiet.getTime())
    assert.equal((await runRepricePass(h.deps, st, new Date("2026-10-22T06:15:45Z")))?.skipped, true)
  })

  it("a game within the window plus an hour keeps the quarter-hour slot while someone is watching", async () => {
    const h = harness([target({ startsAt: startsIn(3 * 60 + 30) })])
    h.deps.reprice!.lastActivity = async () => quiet
    const pass = await runRepricePass(h.deps, newWorkerState(), quiet)
    assert.equal(pass?.nextPassMs, new Date("2026-10-22T06:15:45Z").getTime() - quiet.getTime())
    assert.equal(pass?.hourly, false)
  })

  it("unwatched, a game within the window plus an hour (or inside the window) is read hourly too", async () => {
    for (const min of [3 * 60 + 30, 90]) {
      const h = harness([target({ startsAt: startsIn(min) })])
      unwatched(h)
      const st = newWorkerState()
      const pass = await runRepricePass(h.deps, st, quiet)
      assert.equal(pass?.nextPassMs, new Date("2026-10-22T07:00:45Z").getTime() - quiet.getTime(), `${min} min out`)
      assert.equal(pass?.hourly, true)
      // No database read at the quarter-hour slots in between, and the skipped answer still says hourly.
      const skipped = await runRepricePass(h.deps, st, new Date("2026-10-22T06:15:45Z"))
      assert.equal(skipped?.skipped, true)
      assert.equal(skipped?.hourly, true)
    }
  })

  it("outside quiet hours an unwatched game keeps the quarter-hour slot", async () => {
    const day = new Date("2026-10-22T18:02:00Z")
    const h = harness([target({ startsAt: new Date(day.getTime() + 90 * 60_000) })])
    unwatched(h)
    const pass = await runRepricePass(h.deps, newWorkerState(), day)
    assert.equal(pass?.nextPassMs, new Date("2026-10-22T18:15:45Z").getTime() - day.getTime())
    assert.equal(pass?.hourly, false)
  })

  it("an unwatched game inside the window read hourly gets the hourly stale tolerance", async () => {
    const run = async (minutes: number) => {
      const h = harness([target({ startsAt: startsIn(90), state: state({ lockAt: startsIn(90), exchangeOkAt: new Date(quiet.getTime() - minutes * 60_000) }) })], { half: 0.05 })
      unwatched(h)
      await runRepricePass(h.deps, newWorkerState(), quiet)
      return h.frozen.length
    }
    assert.equal(await run(70), 0)
    assert.equal(await run(130), 1)
  })

  it("one missed hourly read does not freeze a far market; two hours without a good read does", async () => {
    const run = async (minutes: number) => {
      const h = harness([target({ startsAt: startsIn(8 * 60), state: state({ lockAt: startsIn(8 * 60), exchangeOkAt: new Date(quiet.getTime() - minutes * 60_000) }) })], { half: 0.05 })
      unwatched(h)
      await runRepricePass(h.deps, newWorkerState(), quiet)
      return h.frozen.length
    }
    assert.equal(await run(70), 0)
    assert.equal(await run(130), 1)
  })
})

describe("half-hour band cadence (weekends and weekday nights outside quiet hours)", () => {
  const sat = new Date("2026-10-24T18:02:00Z")
  const unwatched = (h: ReturnType<typeof harness>) => void (h.deps.reprice!.lastActivity = async () => null)
  const startsIn = (min: number) => new Date(sat.getTime() + min * 60_000)

  it("unwatched, a game inside the window is read on the half hour, with no database read at the quarter in between", async () => {
    const h = harness([target({ startsAt: startsIn(90) })])
    unwatched(h)
    const st = newWorkerState()
    const pass = await runRepricePass(h.deps, st, sat)
    assert.equal(pass?.nextPassMs, new Date("2026-10-24T18:30:45Z").getTime() - sat.getTime())
    assert.equal(pass?.hourly, true)
    assert.equal((await runRepricePass(h.deps, st, new Date("2026-10-24T18:15:45Z")))?.skipped, true)
  })

  it("someone watching keeps the fast cadence near kickoff", async () => {
    const h = harness([target({ startsAt: startsIn(90) })])
    h.deps.reprice!.lastActivity = async () => sat
    const pass = await runRepricePass(h.deps, newWorkerState(), sat)
    assert.equal(pass?.nextPassMs, REPRICE.passMs)
    assert.equal(pass?.hourly, false)
  })

  it("one missed half-hour read does not freeze an unwatched market; a long outage still does", async () => {
    const run = async (minutes: number) => {
      const h = harness([target({ startsAt: startsIn(90), state: state({ lockAt: startsIn(90), exchangeOkAt: new Date(sat.getTime() - minutes * 60_000) }) })], { half: 0.05 })
      unwatched(h)
      await runRepricePass(h.deps, newWorkerState(), sat)
      return h.frozen.length
    }
    assert.equal(await run(50), 0)
    assert.equal(await run(130), 1)
  })
})
