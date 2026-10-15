import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { shapeStandings, type StandingLike } from "./league-view.ts"

const row = (over: Partial<StandingLike> & Record<string, unknown>): StandingLike & Record<string, unknown> => ({
  userId: "u-secret", name: "Ana", handle: "ana1234", rank: 1, percent: 5, days: 30, hasHistory: true, isYou: false, shareHoldings: false, holdings: [],
  image: "https://img/x.png", reactions: { "🔥": 2 }, inviteCode: "ABC123", balance: 99_999, ...over,
})

describe("shapeStandings", () => {
  const rows = [
    row({ userId: "a", name: "Ana", rank: 1, percent: 8.123, shareHoldings: true, holdings: [{ ticker: "NVDA", name: "Nvidia", weight: 41.26 }] }),
    row({ userId: "me", name: "Me", rank: 2, percent: 5, isYou: true, shareHoldings: false, holdings: [{ ticker: "AAPL", name: "Apple", weight: 70 }] }),
    row({ userId: "c", name: "Cy", rank: 3, percent: 1, shareHoldings: false, holdings: [{ ticker: "TSLA", name: "Tesla", weight: 90 }] }),
    row({ userId: "d", name: "Di", rank: 4, percent: 0, days: 1, hasHistory: false }),
  ]
  const view = shapeStandings(rows)

  it("never lets ids, images, invite codes, balances or reactions through", () => {
    const text = JSON.stringify(view)
    for (const secret of ["u-secret", "img/x.png", "ABC123", "99999", "🔥", '"userId"', '"image"']) assert.ok(!text.includes(secret), secret)
  })

  it("shows holdings only for members who share them", () => {
    assert.deepEqual(view.standings[0]!.sharedHoldings, [{ ticker: "NVDA", weightPercent: 41.3 }])
    assert.equal(view.standings.find((s) => s.member === "Cy")!.sharedHoldings, undefined)
    // Even the viewer's own holdings follow the same flag here: the portfolio tools cover those.
    assert.equal(view.standings.find((s) => s.isYou)!.sharedHoldings, undefined)
  })

  it("computes the gap to the leader and labels the viewer", () => {
    assert.deepEqual(view.you, { rank: 2, returnPercent: 5, gapToLeaderPoints: -3.12 })
    assert.equal(view.standings.find((s) => s.isYou)!.member, "You")
  })

  it("leaves unranked members out of the ranking instead of inventing a return", () => {
    const last = view.standings[view.standings.length - 1]!
    assert.equal(last.rank, null)
    assert.equal(last.returnPercent, null)
    assert.equal(view.ranked, 3)
    assert.equal(view.members, 4)
  })

  it("handles a league where the viewer has no history yet", () => {
    const v = shapeStandings([row({ isYou: true, hasHistory: false, days: 0 }), row({ userId: "b", rank: 1 })])
    assert.deepEqual(v.you, { rank: null, returnPercent: null, gapToLeaderPoints: null })
  })
})
