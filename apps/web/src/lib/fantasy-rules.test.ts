import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyTrade,
  checkEndChange,
  checkQueuedOrder,
  fillsAtOpen,
  isClosed,
  MAX_PENDING_ORDERS,
  portfolioValue,
  reservedCash,
  returnPct,
  TradeRejected,
  type MemberState,
} from "./fantasy-rules.ts"

const fresh = (): MemberState => ({ cash: 100_000, positions: [] })
const noCap = { maxPositionPct: null }

describe("applyTrade: buys", () => {
  it("turns cash into shares at the price", () => {
    const out = applyTrade(fresh(), { side: "buy", securityId: "mkt:NVDA", price: 125, amount: 10_000 }, noCap)
    assert.equal(out.shares, 80)
    assert.equal(out.cashDelta, -10_000)
    assert.deepEqual(out.position, { shares: 80, costBasis: 10_000 })
  })

  it("adds to an existing position and its cost basis", () => {
    const state: MemberState = { cash: 50_000, positions: [{ securityId: "mkt:AAPL", shares: 10, costBasis: 2_000, price: 250 }] }
    const out = applyTrade(state, { side: "buy", securityId: "mkt:AAPL", price: 250, amount: 500 }, noCap)
    assert.deepEqual(out.position, { shares: 12, costBasis: 2_500 })
  })

  it("rejects spending more cash than you have", () => {
    assert.throws(() => applyTrade(fresh(), { side: "buy", securityId: "x", price: 10, amount: 100_001 }, noCap), TradeRejected)
  })

  it("rejects an empty amount and a missing price", () => {
    assert.throws(() => applyTrade(fresh(), { side: "buy", securityId: "x", price: 10, amount: 0 }, noCap), TradeRejected)
    assert.throws(() => applyTrade(fresh(), { side: "buy", securityId: "x", price: 0, amount: 10 }, noCap), TradeRejected)
  })

  it("enforces the position cap against the whole portfolio", () => {
    const cap = { maxPositionPct: 25 }
    assert.doesNotThrow(() => applyTrade(fresh(), { side: "buy", securityId: "x", price: 10, amount: 25_000 }, cap))
    assert.throws(() => applyTrade(fresh(), { side: "buy", securityId: "x", price: 10, amount: 25_001 }, cap), /caps any one pick at 25%/)
  })
})

describe("applyTrade: sells", () => {
  const holding: MemberState = { cash: 0, positions: [{ securityId: "mkt:TSLA", shares: 40, costBasis: 8_000, price: 300 }] }

  it("sells part and shrinks the cost basis in proportion", () => {
    const out = applyTrade(holding, { side: "sell", securityId: "mkt:TSLA", price: 300, shares: 10 }, noCap)
    assert.equal(out.cashDelta, 3_000)
    assert.deepEqual(out.position, { shares: 30, costBasis: 6_000 })
  })

  it("sells everything and removes the position", () => {
    const out = applyTrade(holding, { side: "sell", securityId: "mkt:TSLA", price: 300, shares: "all" }, noCap)
    assert.equal(out.shares, 40)
    assert.equal(out.cashDelta, 12_000)
    assert.equal(out.position, null)
  })

  it("rejects selling what you don't own", () => {
    assert.throws(() => applyTrade(holding, { side: "sell", securityId: "mkt:TSLA", price: 300, shares: 41 }, noCap), TradeRejected)
    assert.throws(() => applyTrade(holding, { side: "sell", securityId: "mkt:GME", price: 20, shares: 1 }, noCap), TradeRejected)
  })
})

describe("scoring", () => {
  it("values cash plus positions at their prices", () => {
    const state: MemberState = { cash: 1_000, positions: [{ securityId: "a", shares: 2, costBasis: 100, price: 60 }] }
    assert.equal(portfolioValue(state), 1_120)
  })

  it("measures return against starting cash", () => {
    assert.equal(Math.round(returnPct(110_000, 100_000)), 10)
    assert.equal(Math.round(returnPct(95_000, 100_000)), -5)
  })

  it("closes a league at its end time and never without one", () => {
    const now = new Date("2026-10-01T00:00:00Z")
    assert.equal(isClosed(null, now), false)
    assert.equal(isClosed(new Date("2026-09-30T23:59:59Z"), now), true)
    assert.equal(isClosed(new Date("2026-10-02T00:00:00Z"), now), false)
  })
})

describe("changing a league's end date", () => {
  const now = new Date("2026-10-01T12:00:00Z")
  const day = (d: number) => new Date(now.getTime() + d * 86_400_000)

  it("lets the owner push it later", () => {
    assert.equal(checkEndChange(day(3), day(33), now), null)
  })

  it("lets the owner remove the end date altogether", () => {
    assert.equal(checkEndChange(day(3), null, now), null)
  })

  it("won't shorten a league, or leave it where it is", () => {
    assert.match(checkEndChange(day(30), day(10), now)!, /later/)
    assert.match(checkEndChange(day(30), day(30), now)!, /later/)
  })

  it("won't cut a league that has no end short by giving it one", () => {
    assert.match(checkEndChange(null, day(30), now)!, /no end date/)
    assert.equal(checkEndChange(null, null, now), null)
  })
})

describe("fillsAtOpen", () => {
  it("fills stocks now during the regular session", () => {
    assert.equal(fillsAtOpen("stock", new Date("2026-09-29T13:30:00Z")), false) // 9:30am ET
    assert.equal(fillsAtOpen("stock", new Date("2026-09-29T17:00:00Z")), false)
  })

  it("queues stocks in extended hours, when only the stale close is on file", () => {
    assert.equal(fillsAtOpen("stock", new Date("2026-09-29T12:00:00Z")), true) // 8am ET pre-market
    assert.equal(fillsAtOpen("stock", new Date("2026-09-29T13:29:00Z")), true)
    assert.equal(fillsAtOpen("stock", new Date("2026-09-29T20:05:00Z")), true)
    assert.equal(fillsAtOpen("stock", new Date("2026-09-29T23:30:00Z")), true) // 7:30pm ET after hours
    assert.equal(fillsAtOpen("stock", new Date("2026-09-30T03:00:00Z")), true) // overnight
  })

  it("queues stocks on weekends", () => {
    assert.equal(fillsAtOpen("stock", new Date("2026-10-03T15:00:00Z")), true)
  })

  it("follows New York time across daylight saving", () => {
    assert.equal(fillsAtOpen("stock", new Date("2026-12-15T14:29:00Z")), true)
    assert.equal(fillsAtOpen("stock", new Date("2026-12-15T14:30:00Z")), false)
  })

  it("never queues crypto, which trades around the clock", () => {
    assert.equal(fillsAtOpen("crypto", new Date("2026-09-29T23:30:00Z")), false)
    assert.equal(fillsAtOpen("crypto", new Date("2026-10-03T15:00:00Z")), false)
  })
})

describe("reservedCash", () => {
  it("sets aside queued buys and ignores sells", () => {
    assert.equal(reservedCash([{ side: "buy", amount: 1_000 }, { side: "sell", amount: null }, { side: "buy", amount: 250.5 }]), 1_250.5)
    assert.equal(reservedCash([]), 0)
  })
})

describe("checkQueuedOrder", () => {
  const ctx = { availableCash: 10_000, heldShares: 10, queuedSellShares: 0, pendingCount: 0 } as const

  it("queues a buy the set-aside cash still covers", () => {
    assert.equal(checkQueuedOrder({ side: "buy", amount: 10_000 }, ctx), null)
  })

  it("won't spend cash already set aside for another queued buy", () => {
    assert.match(checkQueuedOrder({ side: "buy", amount: 10_000.01 }, ctx) ?? "", /\$10,000\.00 to spend/)
    assert.match(checkQueuedOrder({ side: "buy", amount: 1 }, { ...ctx, availableCash: -5 }) ?? "", /\$0\.00 to spend/)
  })

  it("queues a sell of shares held now", () => {
    assert.equal(checkQueuedOrder({ side: "sell", shares: 10 }, ctx), null)
    assert.equal(checkQueuedOrder({ side: "sell", shares: "all" }, ctx), null)
  })

  it("won't queue selling what you don't hold", () => {
    assert.equal(checkQueuedOrder({ side: "sell", shares: 1 }, { ...ctx, heldShares: 0 }), "You don't own any of that yet")
    assert.equal(checkQueuedOrder({ side: "sell", shares: 11 }, ctx), "You don't own that many shares")
  })

  it("counts sells already queued", () => {
    assert.equal(checkQueuedOrder({ side: "sell", shares: 4 }, { ...ctx, queuedSellShares: 6 }), null)
    assert.equal(checkQueuedOrder({ side: "sell", shares: 5 }, { ...ctx, queuedSellShares: 6 }), "That's more than you hold once your queued sells go through")
    assert.equal(checkQueuedOrder({ side: "sell", shares: 1 }, { ...ctx, queuedSellShares: "all" }), "You've already queued selling all of it")
  })

  it("caps how many orders can wait", () => {
    assert.match(checkQueuedOrder({ side: "buy", amount: 1 }, { ...ctx, pendingCount: MAX_PENDING_ORDERS }) ?? "", /Cancel one/)
  })
})

describe("applyTrade: reserved cash", () => {
  const state: MemberState = { cash: 10_000, positions: [] }
  const buy = (amount: number) => ({ side: "buy" as const, securityId: "mkt:NVDA", price: 100, amount })

  it("can't spend cash set aside for queued buys", () => {
    assert.throws(() => applyTrade(state, buy(6_000), { maxPositionPct: null, reservedCash: 5_000 }), TradeRejected)
    assert.equal(applyTrade(state, buy(5_000), { maxPositionPct: null, reservedCash: 5_000 }).shares, 50)
  })

  it("still measures the pick cap against the whole portfolio", () => {
    // 40% of $10,000 is $4,000, even with $5,000 set aside.
    assert.equal(applyTrade(state, buy(4_000), { maxPositionPct: 40, reservedCash: 5_000 }).shares, 40)
  })
})
