import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyStored,
  applyTrade,
  findLedgerMismatches,
  portfolioValue,
  positionStats,
  replayLedger,
  returnPct,
  roundForStorage,
  scoredValue,
  wantsSnapshot,
  type MemberState,
  type TradeRecord,
} from "./fantasy-rules.ts"
import { rankReturns } from "./return-display.ts"

/**
 * Regression cases for the trading patterns friends actually use: leaving a
 * pick and coming back, trimming, running several picks at once, and how all
 * of that lands on the leaderboard. Each case also replays the trade log the
 * way the nightly integrity check does, so the stored book and the history
 * can't quietly drift apart.
 */

const START = 100_000
const noCap = { maxPositionPct: null }
const near = (a: number, b: number, tol = 0.01, msg = "") => assert.ok(Math.abs(a - b) < tol, `${msg} expected ${b}, got ${a}`)

function player(prices: Record<string, number>, start = START) {
  let state: MemberState = { cash: start, positions: [] }
  const log: TradeRecord[] = []
  const mark = () => {
    state = { ...state, positions: state.positions.map((p) => ({ ...p, price: prices[p.securityId]! })) }
  }
  const trade = (securityId: string, req: { side: "buy"; amount: number } | { side: "sell"; shares: number | "all" }) => {
    mark()
    const price = prices[securityId]!
    const out = applyTrade(state, { ...req, securityId, price }, noCap)
    state = applyStored(state, securityId, price, out)
    log.push({ securityId, side: req.side, shares: Number(roundForStorage(out).shares), price })
    return out
  }
  return {
    buy: (id: string, amount: number) => trade(id, { side: "buy", amount }),
    sell: (id: string, shares: number | "all") => trade(id, { side: "sell", shares }),
    move: (next: Record<string, number>) => Object.assign(prices, next),
    get state() {
      mark()
      return state
    },
    get value() {
      mark()
      return portfolioValue(state)
    },
    get returnPct() {
      return returnPct(this.value, start)
    },
    held: (id: string) => state.positions.find((p) => p.securityId === id),
    avgCost: (id: string) => positionStats(state.positions.find((p) => p.securityId === id)!, prices[id]!).averageCost,
    /** What the nightly check would report for this player. */
    audit: () =>
      findLedgerMismatches(
        { cash: state.cash, positions: state.positions.map(({ securityId, shares, costBasis }) => ({ securityId, shares, costBasis })) },
        replayLedger(start, log),
      ),
  }
}

describe("exiting a pick and buying back in", () => {
  it("a re-entry starts a fresh average cost instead of blending with the old lot", () => {
    const p = player({ NVDA: 100 })
    p.buy("NVDA", 50_000) // 500 sh at 100
    p.move({ NVDA: 150 })
    p.sell("NVDA", "all") // bank +25,000
    assert.equal(p.held("NVDA"), undefined)
    p.move({ NVDA: 120 })
    p.buy("NVDA", 60_000) // 500 sh at 120
    near(p.avgCost("NVDA"), 120, 1e-6, "average cost after re-entry")
    near(p.held("NVDA")!.costBasis, 60_000, 0.01)
    near(p.value, 125_000, 0.01, "the banked gain survives the re-entry")
    assert.deepEqual(p.audit(), [])
  })

  it("re-entering lower after a losing exit keeps the loss and prices the new lot at the new price", () => {
    const p = player({ TSLA: 300 })
    p.buy("TSLA", 90_000)
    p.move({ TSLA: 240 }) // -20% on the position
    p.sell("TSLA", "all")
    near(p.state.cash, 82_000, 0.01)
    p.buy("TSLA", 82_000)
    near(p.avgCost("TSLA"), 240, 1e-6)
    near(p.returnPct, -18, 1e-6)
    p.move({ TSLA: 264 }) // new lot +10%
    near(p.value, 82_000 * 1.1, 0.01)
    assert.deepEqual(p.audit(), [])
  })

  it("many exits and re-entries of the same ticker still reconcile to the trade log", () => {
    const p = player({ SPY: 500 })
    const path = [510, 495.5, 530.25, 470, 512.12, 540, 499.99]
    for (const price of path) {
      p.buy("SPY", p.state.cash * 0.8)
      p.move({ SPY: price })
      p.sell("SPY", "all")
      assert.equal(p.held("SPY"), undefined)
    }
    assert.deepEqual(p.audit(), [])
    assert.equal(p.state.positions.length, 0)
    near(p.value, p.state.cash, 1e-9, "an all-cash book is worth its cash")
  })
})

describe("partial sells", () => {
  it("trimming in steps down to nothing ends with no position and the right cash", () => {
    const p = player({ AAPL: 200 })
    p.buy("AAPL", 40_000) // 200 sh
    p.move({ AAPL: 210 })
    p.sell("AAPL", 50)
    p.move({ AAPL: 190 })
    p.sell("AAPL", 50)
    p.move({ AAPL: 220 })
    p.sell("AAPL", 100) // exactly what's left, typed rather than "all"
    assert.equal(p.held("AAPL"), undefined)
    near(p.state.cash, 60_000 + 50 * 210 + 50 * 190 + 100 * 220, 0.01)
    assert.deepEqual(p.audit(), [])
  })

  it("a sale that would leave dust closes the position, and the nightly check agrees", () => {
    // 1.0000005 shares; the sell box only takes four decimals, so typing 1 leaves 0.0000005.
    const p = player({ BRK: 100 })
    p.buy("BRK", 100.00005)
    assert.equal(p.held("BRK")!.shares, 1.0000005)
    const out = p.sell("BRK", 1)
    assert.equal(out.position, null, "a remainder too small to show should not linger as a pick")
    assert.equal(p.held("BRK"), undefined)
    near(p.state.cash, START, 0.01)
    assert.deepEqual(p.audit(), [])
  })

  it("a small but real remainder stays, and replays the same", () => {
    const p = player({ BRK: 100 })
    p.buy("BRK", 100.5) // 1.005 sh
    p.sell("BRK", 1)
    near(p.held("BRK")!.shares, 0.005, 1e-9)
    near(p.avgCost("BRK"), 100, 1e-6)
    assert.deepEqual(p.audit(), [])
  })
})

describe("several picks at once", () => {
  it("value is cash plus every pick at its own price, and each pick keeps its own average cost", () => {
    const p = player({ NVDA: 100, AAPL: 200, BTC: 60_000 })
    p.buy("NVDA", 30_000) // 300 sh
    p.buy("AAPL", 30_000) // 150 sh
    p.buy("BTC", 30_000) // 0.5
    p.move({ NVDA: 110, AAPL: 180, BTC: 66_000 })
    near(p.value, 10_000 + 300 * 110 + 150 * 180 + 0.5 * 66_000, 0.01)
    p.sell("AAPL", 75) // trim the loser
    p.buy("NVDA", 5_000) // add to the winner at 110
    near(p.avgCost("AAPL"), 200, 1e-6)
    near(p.avgCost("BTC"), 60_000, 1e-6)
    near(p.avgCost("NVDA"), 35_000 / (300 + 5_000 / 110), 1e-6)
    assert.deepEqual(p.audit(), [])
  })

  it("selling one pick never touches the others", () => {
    const p = player({ A: 10, B: 20, C: 30 })
    p.buy("A", 20_000)
    p.buy("B", 20_000)
    p.buy("C", 20_000)
    const before = p.state.positions.filter((x) => x.securityId !== "B").map(({ securityId, shares, costBasis }) => ({ securityId, shares, costBasis }))
    p.move({ B: 25 })
    p.sell("B", "all")
    const after = p.state.positions.map(({ securityId, shares, costBasis }) => ({ securityId, shares, costBasis }))
    assert.deepEqual(after.sort((x, y) => x.securityId.localeCompare(y.securityId)), before)
  })

  it("spending every last cent leaves zero cash, never negative", () => {
    const p = player({ A: 33.33, B: 77.77, C: 1.23 })
    p.buy("A", 33_333.33)
    p.buy("B", 33_333.33)
    p.buy("C", p.state.cash)
    assert.ok(p.state.cash >= 0 && p.state.cash < 1e-6, `cash ${p.state.cash}`)
    assert.throws(() => p.buy("A", 0.01), /Not enough cash/)
    near(p.value, START, 0.01)
    assert.deepEqual(p.audit(), [])
  })
})

describe("leaderboard", () => {
  const standings = (players: Record<string, ReturnType<typeof player>>) =>
    rankReturns(Object.entries(players).map(([name, p]) => ({ name, percent: p.returnPct })))

  it("ranks by return, whether the gain is still in picks or already banked as cash", () => {
    const prices = { NVDA: 100, AAPL: 100 }
    const holder = player(prices)
    const seller = player(prices)
    const switcher = player(prices)
    const idle = player(prices)
    holder.buy("NVDA", 100_000)
    seller.buy("NVDA", 50_000)
    switcher.buy("NVDA", 100_000)
    holder.move({ NVDA: 120 }) // shared price object: everyone sees it
    seller.sell("NVDA", "all") // banks +10,000
    switcher.sell("NVDA", "all")
    switcher.buy("AAPL", 120_000)
    switcher.move({ AAPL: 90 }) // -10% on 120k = 108k

    const ranked = standings({ holder, seller, switcher, idle })
    assert.deepEqual(
      ranked.map((r) => [r.name, r.rank]),
      [
        ["holder", 1], // +20%
        ["seller", 2], // +10%
        ["switcher", 3], // +8%
        ["idle", 4], // 0%
      ],
    )
    near(ranked[2]!.percent, 8, 1e-6)
  })

  it("players with the same return to the cent share a rank", () => {
    const prices = { A: 50, B: 25 }
    const one = player(prices)
    const two = player(prices)
    const three = player(prices)
    one.buy("A", 50_000)
    two.buy("B", 50_000) // a different pick that moves the same amount
    one.move({ A: 55, B: 27.5 })
    const ranked = standings({ one, two, three })
    assert.deepEqual(ranked.map((r) => r.rank), [1, 1, 3])
  })
})

describe("final standings of a finished league", () => {
  // Nightly snapshots run at 22:30 UTC. This league ends Friday at 3pm UTC, mid-session.
  const endsAt = new Date("2026-10-09T15:00:00Z")
  const thursday = { date: "2026-10-08", value: 101_000 }
  const friday = { date: "2026-10-09", value: 104_000 }

  it("uses the live value while the league is running", () => {
    assert.equal(scoredValue(endsAt, [thursday], 103_500, new Date("2026-10-09T14:00:00Z")), 103_500)
    assert.equal(scoredValue(null, [thursday], 103_500), 103_500)
  })

  it("does not fall back to the day before the end, which would drop the final day", () => {
    // Between the end and that night's snapshot, the latest snapshot is Thursday's.
    assert.equal(scoredValue(endsAt, [thursday], 103_900, new Date("2026-10-09T18:00:00Z")), 103_900)
  })

  it("freezes on the first snapshot dated on or after the end day", () => {
    assert.equal(scoredValue(endsAt, [thursday, friday], 120_000, new Date("2026-10-10T12:00:00Z")), 104_000)
    assert.equal(scoredValue(endsAt, [thursday, friday], 80_000, new Date("2027-03-01T12:00:00Z")), 104_000)
  })

  it("keeps a league that ended long ago on its last snapshot", () => {
    assert.equal(scoredValue(endsAt, [thursday], 90_000, new Date("2026-11-01T00:00:00Z")), 101_000)
  })

  it("takes exactly one more snapshot after the end, then stops", () => {
    const fridayNight = new Date("2026-10-09T22:30:00Z")
    assert.equal(wantsSnapshot(endsAt, "2026-10-08", new Date("2026-10-08T22:30:00Z")), true, "running")
    assert.equal(wantsSnapshot(endsAt, "2026-10-08", fridayNight), true, "the final snapshot")
    assert.equal(wantsSnapshot(endsAt, "2026-10-09", new Date("2026-10-10T22:30:00Z")), false, "frozen after that")
    assert.equal(wantsSnapshot(endsAt, "2026-10-08", new Date("2026-10-10T22:30:00Z")), true, "catches up after a missed run")
    assert.equal(wantsSnapshot(endsAt, "2026-10-08", new Date("2026-11-01T22:30:00Z")), false, "but never rewrites an old result")
    assert.equal(wantsSnapshot(null, "2026-10-08"), true, "all-time leagues always")
  })
})
