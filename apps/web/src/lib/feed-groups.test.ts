import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { groupFeed, tradeCount, type FeedLike } from "./feed-groups.ts"

const t0 = Date.parse("2026-09-30T17:00:00Z")
const trade = (id: string, who: string, side: "buy" | "sell", minutesAgo: number, amount = 1000): FeedLike => ({
  id, name: who, handle: who.toLowerCase(), side, shares: 1, price: amount, at: new Date(t0 - minutesAgo * 60_000).toISOString(),
})

describe("groupFeed", () => {
  it("folds a burst of buys by one person into one line with the total", () => {
    const feed = [trade("1", "Josh", "buy", 27, 28125), trade("2", "Josh", "buy", 29, 28125), trade("3", "Josh", "buy", 30, 18750), trade("4", "Josh", "buy", 31, 25000)]
    const entries = groupFeed(feed)
    assert.equal(entries.length, 1)
    const [group] = entries
    assert.equal(group!.kind, "group")
    if (group!.kind === "group") {
      assert.equal(group.items.length, 4)
      assert.equal(group.total, 100_000)
      assert.equal(group.at, feed[0]!.at, "a group is dated by its newest trade")
    }
  })

  it("keeps a buy and a sell apart, even back to back", () => {
    const entries = groupFeed([trade("1", "Nick", "buy", 37, 49597), trade("2", "Nick", "sell", 38, 49597)])
    assert.deepEqual(entries.map((e) => e.kind), ["single", "single"])
  })

  it("doesn't fold different people together", () => {
    const entries = groupFeed([trade("1", "Bennett", "buy", 60), trade("2", "Josh", "buy", 61), trade("3", "Bennett", "buy", 62)])
    assert.deepEqual(entries.map((e) => e.kind), ["single", "single", "single"])
  })

  it("starts a new line when the gap is too long", () => {
    const entries = groupFeed([trade("1", "Nick", "buy", 5), trade("2", "Nick", "buy", 10), trade("3", "Nick", "buy", 600)])
    assert.deepEqual(entries.map((e) => e.kind), ["group", "single"])
  })

  it("leaves a lone trade, an empty feed and the order alone", () => {
    assert.deepEqual(groupFeed([]), [])
    const feed = [trade("1", "A", "buy", 1), trade("2", "B", "sell", 2), trade("3", "C", "buy", 3)]
    const entries = groupFeed(feed)
    assert.deepEqual(entries.map((e) => (e.kind === "single" ? e.item.id : e.key)), ["1", "2", "3"])
  })

  it("never loses or repeats a trade", () => {
    const feed = Array.from({ length: 40 }, (_, i) => trade(String(i), i % 3 === 0 ? "A" : "B", i % 7 === 0 ? "sell" : "buy", i * 4))
    assert.equal(tradeCount(groupFeed(feed)), feed.length)
    const ids = groupFeed(feed).flatMap((e) => (e.kind === "group" ? e.items.map((i) => i.id) : [e.item.id]))
    assert.deepEqual(ids, feed.map((f) => f.id))
  })
})
