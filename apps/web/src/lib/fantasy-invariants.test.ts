import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyStored,
  applyTrade,
  cashSplit,
  findLedgerMismatches,
  portfolioValue,
  positionStats,
  raceSeries,
  replayLedger,
  returnPct,
  roundForStorage,
  type MemberState,
  type TradeRecord,
} from "./fantasy-rules.ts"

/**
 * The promises a fantasy league makes to its players, checked as properties:
 *
 *  - Trading never changes what you're worth. A trade swaps cash for shares (or
 *    back) at the price everyone is valued at, so only price moves make or lose money.
 *  - Selling and buying something else does not damage your return.
 *  - Your return is exactly what your trade history says it is.
 *
 * These run the real rules with the real storage rounding (`applyStored`), so
 * rounding drift shows up here, not on someone's leaderboard.
 */

const START = 100_000
const noCap = { maxPositionPct: null }
const cents = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? "expected"} ${b}, got ${a}`)

type Prices = Record<string, number>

/** A tiny league member you can drive by hand, valued at whatever `prices` says. */
class Member {
  state: MemberState = { cash: START, positions: [] }
  log: TradeRecord[] = []
  realized = 0
  prices: Prices

  constructor(prices: Prices) {
    this.prices = prices
  }

  private mark() {
    this.state = { ...this.state, positions: this.state.positions.map((p) => ({ ...p, price: this.prices[p.securityId]! })) }
  }

  get value() {
    this.mark()
    return portfolioValue(this.state)
  }

  get returnPct() {
    return returnPct(this.value, START)
  }

  buy(securityId: string, amount: number) {
    this.mark()
    const price = this.prices[securityId]!
    const out = applyTrade(this.state, { side: "buy", securityId, price, amount }, noCap)
    this.state = applyStored(this.state, securityId, price, out)
    this.log.push({ securityId, side: "buy", shares: Number(roundForStorage(out).shares), price })
  }

  sell(securityId: string, shares: number | "all") {
    this.mark()
    const price = this.prices[securityId]!
    const held = this.state.positions.find((p) => p.securityId === securityId)!
    const out = applyTrade(this.state, { side: "sell", securityId, price, shares }, noCap)
    this.realized += out.cashDelta - (held.costBasis - (out.position?.costBasis ?? 0))
    this.state = applyStored(this.state, securityId, price, out)
    this.log.push({ securityId, side: "sell", shares: Number(roundForStorage(out).shares), price })
  }

  move(next: Prices) {
    this.prices = { ...this.prices, ...next }
  }

  /** value - start = money banked from sales + paper gains on what's held. */
  get unrealized() {
    this.mark()
    return this.state.positions.reduce((sum, p) => sum + p.shares * p.price - p.costBasis, 0)
  }
}

describe("returns since purchase (worked examples)", () => {
  it("buying does not create a gain or a loss", () => {
    const m = new Member({ NVDA: 225.07, AAPL: 338.4 })
    m.buy("NVDA", 50_000)
    m.buy("AAPL", 50_000)
    assert.equal(m.returnPct, 0)
    cents(m.value, START)
  })

  it("a price rise is exactly the position's gain over the starting cash", () => {
    const m = new Member({ NVDA: 100 })
    m.buy("NVDA", 100_000) // 1,000 shares
    m.move({ NVDA: 110 })
    cents(m.value, 110_000)
    assert.ok(Math.abs(m.returnPct - 10) < 1e-6)
  })

  it("selling locks the gain in and the return does not move", () => {
    const m = new Member({ NVDA: 100 })
    m.buy("NVDA", 100_000)
    m.move({ NVDA: 110 })
    const before = m.returnPct
    m.sell("NVDA", "all")
    assert.ok(Math.abs(m.returnPct - before) < 1e-6)
    cents(m.state.cash, 110_000)
    assert.equal(m.state.positions.length, 0)
  })

  it("selling one thing to buy another carries the whole return across", () => {
    const m = new Member({ NVDA: 100, AAPL: 50 })
    m.buy("NVDA", 100_000)
    m.move({ NVDA: 110 }) // +10%
    m.sell("NVDA", "all")
    m.buy("AAPL", 110_000) // 2,200 shares at 50
    assert.ok(Math.abs(m.returnPct - 10) < 1e-6, "the +10% must survive the switch")

    m.move({ AAPL: 45 }) // the new pick falls 10%
    cents(m.value, 99_000)
    assert.ok(Math.abs(m.returnPct - -1) < 1e-6, "110k -> 99k against 100k start is -1%")
  })

  it("selling at a loss keeps the loss, it doesn't reset the return to zero", () => {
    const m = new Member({ TSLA: 200, GLD: 300 })
    m.buy("TSLA", 100_000)
    m.move({ TSLA: 180 }) // -10%
    m.sell("TSLA", "all")
    cents(m.value, 90_000)
    m.buy("GLD", 90_000)
    assert.ok(Math.abs(m.returnPct - -10) < 1e-6)
  })

  it("churning the same holding at an unchanged price changes nothing", () => {
    const m = new Member({ SPY: 765.61 })
    m.buy("SPY", 60_000)
    const before = m.value
    for (let i = 0; i < 50; i++) {
      m.sell("SPY", "all")
      m.buy("SPY", m.state.cash)
    }
    cents(m.value, before, "value after 50 round trips")
  })

  it("a partial sale leaves the remaining position's own % gain untouched", () => {
    const m = new Member({ NVDA: 100 })
    m.buy("NVDA", 100_000)
    m.move({ NVDA: 125 })
    const gain = (mm: Member) => {
      void mm.value // re-marks positions to the current price
      const p = mm.state.positions[0]!
      return (p.shares * p.price) / p.costBasis - 1
    }
    const before = gain(m)
    m.sell("NVDA", 400)
    assert.ok(Math.abs(gain(m) - before) < 1e-9)
  })

  it("the same final holdings give the same return no matter how you got there", () => {
    const direct = new Member({ A: 10, B: 20 })
    direct.buy("A", 40_000)
    direct.buy("B", 60_000)

    const churned = new Member({ A: 10, B: 20 })
    churned.buy("A", 100_000)
    churned.sell("A", 6_000) // hold 4,000 sh of A = 40k
    churned.buy("B", 60_000)

    direct.move({ A: 12, B: 19 })
    churned.move({ A: 12, B: 19 })
    cents(churned.value, direct.value)
  })
})

describe("average cost on your picks", () => {
  const stats = (m: Member, id: string) => {
    void m.value // re-marks positions to the current price
    const p = m.state.positions.find((x) => x.securityId === id)!
    return positionStats(p, m.prices[id]!)
  }

  it("is what you paid per share, and does not follow the live price", () => {
    const m = new Member({ PLTR: 200 })
    m.buy("PLTR", 50_000) // 250 shares at 200
    assert.ok(Math.abs(stats(m, "PLTR").averageCost - 200) < 1e-6)

    for (const price of [150, 200, 260, 1_000]) {
      m.move({ PLTR: price })
      const s = stats(m, "PLTR")
      assert.ok(Math.abs(s.averageCost - 200) < 1e-6, `average cost drifted to ${s.averageCost} at ${price}`)
      assert.ok(Math.abs(s.value - 250 * price) < 0.01)
      assert.ok(Math.abs(s.gainPct - (price / 200 - 1) * 100) < 1e-6)
    }
  })

  it("gain is (live - average cost) / average cost", () => {
    const m = new Member({ NVDA: 230.55 })
    m.buy("NVDA", 25_000)
    m.move({ NVDA: 236.15 })
    const s = stats(m, "NVDA")
    assert.ok(Math.abs(s.gainPct - ((236.15 - 230.55) / 230.55) * 100) < 1e-6)
  })

  it("a partial sale, at a gain or a loss, leaves the average cost where it was", () => {
    const m = new Member({ NVDA: 100 })
    m.buy("NVDA", 100_000)
    m.move({ NVDA: 125 })
    m.sell("NVDA", 400)
    assert.ok(Math.abs(stats(m, "NVDA").averageCost - 100) < 1e-6, "selling at a gain must not raise the average cost")
    m.move({ NVDA: 60 })
    m.sell("NVDA", 100)
    assert.ok(Math.abs(stats(m, "NVDA").averageCost - 100) < 1e-6, "selling at a loss must not lower it either")
  })

  it("buying more blends the average by what each lot cost", () => {
    const m = new Member({ AAPL: 100 })
    m.buy("AAPL", 10_000) // 100 sh at 100
    m.move({ AAPL: 200 })
    m.buy("AAPL", 20_000) // 100 sh at 200
    assert.ok(Math.abs(stats(m, "AAPL").averageCost - 150) < 1e-6)
    m.move({ AAPL: 165 })
    assert.ok(Math.abs(stats(m, "AAPL").gainPct - 10) < 1e-6)
  })

  it("selling one pick at a gain to buy another doesn't touch either average cost", () => {
    const m = new Member({ SPY: 500, NVDA: 100 })
    m.buy("SPY", 50_000)
    m.buy("NVDA", 25_000)
    m.move({ SPY: 550, NVDA: 90 })
    m.sell("SPY", 40) // bank part of a +10% winner
    m.buy("NVDA", 10_000) // add to a loser at the lower price
    const spy = stats(m, "SPY")
    assert.ok(Math.abs(spy.averageCost - 500) < 1e-6)
    assert.ok(Math.abs(spy.gainPct - 10) < 1e-6)
    const nvda = stats(m, "NVDA") // 250 sh at 100, then 111.11 sh at 90
    assert.ok(Math.abs(nvda.averageCost - 35_000 / (250 + 10_000 / 90)) < 1e-6)
    assert.ok(nvda.averageCost < 100 && nvda.averageCost > 90)
  })

  it("does not divide by zero for an empty position", () => {
    assert.deepEqual(positionStats({ shares: 0, costBasis: 0 }, 50), { averageCost: 0, value: 0, gainPct: 0 })
  })
})

describe("cash vs picks split", () => {
  it("always adds up to 100%", () => {
    for (const [value, cash] of [[100_604, 0], [100_000, 25_000], [50_000, 50_000], [99_999.99, 0.01]] as const) {
      const s = cashSplit(value, cash)
      assert.ok(Math.abs(s.cashPct + s.investedPct - 100) < 1e-9)
    }
    assert.equal(cashSplit(100_604, 0).investedPct, 100)
    assert.equal(cashSplit(100_000, 25_000).cashPct, 25)
  })

  it("stays inside 0-100 for an empty or odd book", () => {
    assert.deepEqual(cashSplit(0, 0), { cashPct: 0, investedPct: 100 })
    assert.equal(cashSplit(100, 150).cashPct, 100)
    assert.equal(cashSplit(100, -5).cashPct, 0)
  })
})

/** Deterministic pseudo-random numbers, so a failing run can be replayed from its seed. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function playRandomSeason(seed: number, steps = 300) {
  const rand = rng(seed)
  const tickers = ["AAA", "BBB", "CCC", "DDD", "EEE"]
  const prices: Prices = Object.fromEntries(tickers.map((t) => [t, Math.round((5 + rand() * 800) * 100) / 100]))
  const m = new Member(prices)
  let trades = 0

  for (let step = 0; step < steps; step++) {
    const roll = rand()
    if (roll < 0.35) {
      // A market day: every price moves up to 6%, never below a dollar.
      const next: Prices = {}
      for (const t of tickers) next[t] = Math.max(1, Math.round(m.prices[t]! * (1 + (rand() - 0.5) * 0.12) * 100) / 100)
      m.move(next)
      continue
    }

    const before = m.value
    const held = m.state.positions
    if (roll < 0.7 || held.length === 0) {
      const amount = Math.floor(m.state.cash * (0.05 + rand() * 0.95) * 100) / 100
      if (amount < 0.01) continue
      m.buy(tickers[Math.floor(rand() * tickers.length)]!, amount)
    } else {
      const p = held[Math.floor(rand() * held.length)]!
      // Round down to the four places the sell box takes, so it never exceeds what's held.
      const partial = Math.floor(p.shares * (0.1 + rand() * 0.9) * 1e4) / 1e4
      const all = rand() < 0.3
      if (!all && partial < 0.0001) continue // too small to type into the box
      m.sell(p.securityId, all ? "all" : partial)
    }
    trades++

    // Invariants that must hold after every single trade.
    cents(m.value, before, `seed ${seed} step ${step}: a trade changed total value`)
    assert.ok(m.state.cash > -1e-6, `seed ${seed} step ${step}: negative cash ${m.state.cash}`)
    for (const p of m.state.positions) assert.ok(p.shares > 0, `seed ${seed} step ${step}: non-positive shares`)
    // Every dollar of gain is either banked from a sale or still on paper.
    cents(m.value - START, m.realized + m.unrealized, `seed ${seed} step ${step}: gain doesn't reconcile`)
  }
  return { m, trades }
}

describe("random seasons: every trade, 25 seeds x 300 steps", () => {
  it("trades never change total value, cash never goes negative, gains always reconcile", () => {
    let totalTrades = 0
    for (let seed = 1; seed <= 25; seed++) totalTrades += playRandomSeason(seed).trades
    assert.ok(totalTrades > 1000, `only ${totalTrades} trades exercised`)
  })

  it("stored cash and positions always equal a replay of the trade log", () => {
    for (let seed = 100; seed < 125; seed++) {
      const { m } = playRandomSeason(seed)
      const replayed = replayLedger(START, m.log)
      const mismatches = findLedgerMismatches(
        { cash: m.state.cash, positions: m.state.positions.map(({ securityId, shares, costBasis }) => ({ securityId, shares, costBasis })) },
        replayed,
      )
      assert.deepEqual(mismatches, [], `seed ${seed}`)
    }
  })

  it("total rounding drift over a whole season stays under a cent", () => {
    for (let seed = 200; seed < 210; seed++) {
      const { m } = playRandomSeason(seed, 500)
      const replayed = replayLedger(START, m.log)
      assert.ok(Math.abs(m.state.cash - replayed.cash) < 0.01, `seed ${seed} drift ${m.state.cash - replayed.cash}`)
    }
  })
})

describe("ledger integrity check", () => {
  const stored = (m: Member) => ({
    cash: m.state.cash,
    positions: m.state.positions.map(({ securityId, shares, costBasis }) => ({ securityId, shares, costBasis })),
  })

  const member = () => {
    const m = new Member({ NVDA: 225.07, PLTR: 187.48 })
    m.buy("NVDA", 25_000)
    m.buy("PLTR", 50_000)
    m.sell("NVDA", 50)
    return m
  }

  it("finds nothing wrong with an honest ledger", () => {
    const m = member()
    assert.deepEqual(findLedgerMismatches(stored(m), replayLedger(START, m.log)), [])
  })

  it("catches cash that doesn't match the trades", () => {
    const m = member()
    const bad = { ...stored(m), cash: m.state.cash + 5 }
    assert.equal(findLedgerMismatches(bad, replayLedger(START, m.log))[0]?.kind, "cash")
  })

  it("catches wrong share counts, wrong cost basis, and phantom or missing positions", () => {
    const m = member()
    const replayed = replayLedger(START, m.log)
    const s = stored(m)

    const shares = { ...s, positions: s.positions.map((p, i) => (i === 0 ? { ...p, shares: p.shares + 1 } : p)) }
    assert.ok(findLedgerMismatches(shares, replayed).some((x) => x.kind === "shares"))

    const basis = { ...s, positions: s.positions.map((p, i) => (i === 0 ? { ...p, costBasis: p.costBasis + 100 } : p)) }
    assert.ok(findLedgerMismatches(basis, replayed).some((x) => x.kind === "cost_basis"))

    const phantom = { ...s, positions: [...s.positions, { securityId: "GME", shares: 5, costBasis: 100 }] }
    assert.ok(findLedgerMismatches(phantom, replayed).some((x) => x.kind === "unexpected_position"))

    const missing = { ...s, positions: s.positions.slice(1) }
    assert.ok(findLedgerMismatches(missing, replayed).some((x) => x.kind === "missing_position"))
  })

  it("ignores rounding noise below a cent", () => {
    const m = member()
    const noisy = { ...stored(m), cash: m.state.cash + 0.004 }
    assert.deepEqual(findLedgerMismatches(noisy, replayLedger(START, m.log)), [])
  })
})

describe("race chart series", () => {
  it("starts at 100 and ends on the live return", () => {
    const series = raceSeries([100_000, 99_000], 101_500, START)
    assert.equal(series[0], 100)
    assert.equal(series.length, 4)
    assert.ok(Math.abs(series[3]! - 101.5) < 1e-9)
    assert.ok(Math.abs(series[2]! - 99) < 1e-9)
  })

  it("is exactly flat for someone whose value never moved", () => {
    assert.deepEqual(raceSeries([START, START], START, START), [100, 100, 100, 100])
  })

  it("agrees with the headline return", () => {
    const value = 97_804.04
    const series = raceSeries([START], value, START)
    assert.ok(Math.abs(series.at(-1)! - (100 + returnPct(value, START))) < 1e-12)
  })
})
