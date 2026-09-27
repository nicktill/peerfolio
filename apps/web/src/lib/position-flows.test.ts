import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { timeWeightedReturn, type SnapshotPoint } from "./ranges.ts"

/**
 * Replays how manual positions reach the snapshot table: every add or remove
 * is bracketed by the investable total at the current price and recorded as a
 * flow, the nightly reprice records none, and same-day flows accumulate on one
 * row. The return must only ever reflect price moves.
 */
function portfolio() {
  const quantities = new Map<string, number>()
  const prices = new Map<string, number>()
  let typedBalance = 0
  const points: SnapshotPoint[] = []
  let day = 0
  let flow = 0

  // An account with positions is worth them; a typed balance only counts without any.
  const value = () =>
    quantities.size > 0
      ? [...quantities].reduce((sum, [ticker, qty]) => sum + qty * prices.get(ticker)!, 0)
      : typedBalance

  const bracket = (change: () => void) => {
    const before = value()
    change()
    flow += value() - before
  }

  return {
    setPrice: (ticker: string, price: number) => prices.set(ticker, price),
    typeBalance: (amount: number) => bracket(() => (typedBalance = amount)),
    add: (ticker: string, qty: number) => bracket(() => quantities.set(ticker, qty)),
    remove: (ticker: string) => bracket(() => quantities.delete(ticker)),
    /** Close the day: write the snapshot, then move to the next date. */
    snapshot() {
      const v = value()
      points.push({
        date: `2026-01-${String(++day).padStart(2, "0")}`,
        investableAssets: v,
        netWorth: v,
        netFlows: flow,
        isVerified: false,
      })
      flow = 0
    },
    percent: () => timeWeightedReturn(points).percent,
  }
}

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9, `expected ${expected}, got ${actual}`)

describe("manual positions and returns", () => {
  it("books a nightly price move as return", () => {
    const p = portfolio()
    p.setPrice("VTI", 100)
    p.add("VTI", 10)
    p.snapshot()

    p.setPrice("VTI", 105)
    p.snapshot()

    close(p.percent(), 5)
  })

  it("does not count adding a position as a gain", () => {
    const p = portfolio()
    p.setPrice("VTI", 100)
    p.setPrice("NVDA", 50)
    p.add("VTI", 10)
    p.snapshot()

    // Portfolio triples in value, entirely from a new position.
    p.add("NVDA", 40)
    p.snapshot()

    close(p.percent(), 0)
  })

  it("does not count removing a position as a loss", () => {
    const p = portfolio()
    p.setPrice("VTI", 100)
    p.setPrice("NVDA", 50)
    p.add("VTI", 10)
    p.add("NVDA", 40)
    p.snapshot()

    p.remove("NVDA")
    p.snapshot()

    close(p.percent(), 0)
  })

  it("separates a price move from a position added the same day", () => {
    const p = portfolio()
    p.setPrice("VTI", 100)
    p.setPrice("BTC", 1000)
    p.add("VTI", 10)
    p.snapshot()

    // Overnight reprice first (+10%), then a new position at today's price.
    p.setPrice("VTI", 110)
    p.add("BTC", 2)
    p.snapshot()

    close(p.percent(), 10)
  })

  it("nets out a position added and removed on the same day", () => {
    const p = portfolio()
    p.setPrice("VTI", 100)
    p.setPrice("NVDA", 50)
    p.add("VTI", 10)
    p.snapshot()

    p.add("NVDA", 100)
    p.remove("NVDA")
    p.setPrice("VTI", 90)
    p.snapshot()

    close(p.percent(), -10)
  })

  it("treats switching a typed balance to positions as a flow", () => {
    const p = portfolio()
    p.typeBalance(5000)
    p.snapshot()

    // The positions are worth less than the old typed number; that gap is a
    // correction, not a loss.
    p.setPrice("VTI", 100)
    p.add("VTI", 40)
    p.snapshot()

    p.setPrice("VTI", 102)
    p.snapshot()

    close(p.percent(), 2)
  })

  it("changing a quantity is a flow for the difference only", () => {
    const p = portfolio()
    p.setPrice("VTI", 100)
    p.add("VTI", 10)
    p.snapshot()

    p.setPrice("VTI", 120)
    p.snapshot()

    p.add("VTI", 25)
    p.snapshot()

    close(p.percent(), 20)
  })
})
