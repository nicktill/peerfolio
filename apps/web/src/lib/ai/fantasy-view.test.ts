import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { shapeFantasy, type FantasyLeagueLike } from "./fantasy-view.ts"

const data = {
  league: { name: "Alpha", startingCash: 100_000, maxPositionPct: 40, endsAt: "2026-12-31", isClosed: false, inviteCode: "SECRETCODE", ownerId: "owner-1" },
  standings: [
    { userId: "u1", image: "https://img/a.png", reactions: { "🔥": 3 }, name: "Ana", handle: "ana", rank: 1, percent: 12.345, isYou: false, value: 112_345, cash: 5000, holdings: [{ ticker: "NVDA", weight: 60.04 }] },
    { userId: "me", image: null, reactions: {}, name: "Me", handle: "me", rank: 2, percent: 4, isYou: true, value: 104_000, cash: 1000, holdings: [{ ticker: "AAPL", weight: 50 }] },
  ],
  you: { cash: 900, value: 104_000, percent: 4, rank: 2, positions: [{ ticker: "AAPL", shares: 10, value: 3000, price: 300 }, { ticker: "MSFT", shares: 5, value: 1000, price: 200 }], orders: [{ status: "pending" }, { status: "filled" }] },
  feed: [{ id: "f1", image: "https://img/b.png", name: "Ana", handle: "ana", side: "buy" as const, ticker: "NVDA", shares: 3, price: 120.5, at: "2026-10-14T15:00:00Z" }],
} as unknown as FantasyLeagueLike

describe("shapeFantasy", () => {
  const view = shapeFantasy(data, new Date("2026-10-15T12:00:00Z"))

  it("never lets invite codes, owner ids, user ids, images or reactions through", () => {
    const text = JSON.stringify(view)
    for (const secret of ["SECRETCODE", "owner-1", '"u1"', "img/a.png", "img/b.png", "🔥", '"userId"']) assert.ok(!text.includes(secret), secret)
  })

  it("computes the gap to the leader and labels the viewer", () => {
    assert.equal(view.you.gapToLeaderPoints, -8.35)
    assert.equal(view.standings[1]!.member, "You")
    assert.equal(view.you.pendingOrders, 1)
  })

  it("weights the viewer's positions by their own total", () => {
    assert.deepEqual(view.you.positions.map((p) => p.weightPercent), [75, 25])
  })

  it("says prices are stored, not live, and reports the league window", () => {
    assert.match(view.pricesNote, /stored/)
    assert.equal(view.league.endsAt, "2026-12-31")
    assert.equal(view.recentTrades[0]!.side, "buy")
  })
})
