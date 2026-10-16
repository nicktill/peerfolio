import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { canSpend, DEFAULT_PLAN, estimateCredits, MemoryUsageStore } from "./credit-budget.ts"
import { planPublication } from "./lines.ts"
import { createCompositeOdds, isThin, mergeSnapshots, sameEvent, withSnapshotCache } from "./providers/composite.ts"
import { mockEvent } from "./providers/mock.ts"
import type { OddsProvider, ProviderEvent } from "./types.ts"

const NOW = new Date("2026-10-18T12:00:00Z")
const hours = (h: number) => new Date(NOW.getTime() + h * 3600_000)

describe("credit budget", () => {
  const plan = { monthly: 500, safety: 0.9, dayBurst: 2 }
  it("allows spend inside the month and the paced day", () => {
    assert.equal(canSpend(plan, { month: 0, day: 0 }, 20, NOW), true)
  })
  it("refuses once the day's paced share is gone", () => {
    // October: 450 usable / 31 days * 2 = 30 per day
    assert.equal(canSpend(plan, { month: 100, day: 25 }, 6, NOW), false)
    assert.equal(canSpend(plan, { month: 100, day: 25 }, 5, NOW), true)
  })
  it("refuses once the month's safety cap is gone", () => {
    assert.equal(canSpend(plan, { month: 445, day: 0 }, 6, NOW), false)
  })
  it("estimates Odds-API-style credits", () => {
    assert.equal(estimateCredits({ gameMarkets: 3, regions: 1, sportKeys: 1, propMarkets: 4, propEvents: 8 }), 35)
  })
})

describe("composite odds", () => {
  const start = hours(48)
  const stub = (name: string, events: ProviderEvent[] | Error, calls: string[] = []): OddsProvider => ({
    name,
    async fetchOdds() {
      calls.push(name)
      if (events instanceof Error) throw events
      return { provider: name, fetchedAt: NOW, events }
    },
  })
  const rich = () => [mockEvent("nfl", 1, start)]
  const thin = () => {
    const e = mockEvent("nfl", 1, start)
    for (const m of e.markets) for (const o of m.outcomes) o.quotes = o.quotes.slice(0, 2)
    return [e]
  }
  const src = (provider: OddsProvider, monthly = 500) => ({ provider, plan: { ...DEFAULT_PLAN, monthly }, cost: () => 10 })

  it("does not spend the second source when the first is rich enough", async () => {
    const calls: string[] = []
    const c = createCompositeOdds([src(stub("a", rich(), calls)), src(stub("b", rich(), calls))], new MemoryUsageStore())
    await c.fetchOdds("nfl", NOW)
    assert.deepEqual(calls, ["a"])
  })
  it("stacks a second source's books onto thin markets", async () => {
    const other = mockEvent("nfl", 1, start)
    for (const m of other.markets) for (const o of m.outcomes) o.quotes = o.quotes.map((q) => ({ ...q, book: `x${q.book}` }))
    const c = createCompositeOdds([src(stub("a", thin())), src(stub("b", [other]))], new MemoryUsageStore())
    const snap = await c.fetchOdds("nfl", NOW)
    assert.equal(snap.events.length, 1)
    assert.equal(snap.events[0]!.markets[0]!.outcomes[0]!.quotes.length, 6)
    assert.equal(isThin(snap.events, 3), false)
  })
  it("fails over when the first source throws", async () => {
    const c = createCompositeOdds([src(stub("a", new Error("down"))), src(stub("b", rich()))], new MemoryUsageStore())
    const snap = await c.fetchOdds("nfl", NOW)
    assert.equal(snap.events.length, 1)
    assert.ok(snap.notes!.some((n) => n.startsWith("a: failed")))
  })
  it("skips a source whose credit pace is used up and charges only the ones it uses", async () => {
    const usage = new MemoryUsageStore()
    const calls: string[] = []
    // monthly 20 -> daily share ~1, so a 10-credit fetch is refused
    const c = createCompositeOdds([src(stub("a", thin(), calls), 20), src(stub("b", rich(), calls))], usage)
    await c.fetchOdds("nfl", NOW)
    assert.deepEqual(calls, ["b"])
    assert.equal((await usage.usage("b", NOW)).month, 10)
    assert.equal((await usage.usage("a", NOW)).month, 0)
  })
  it("yields nothing publishable when every source is down", async () => {
    const c = createCompositeOdds([src(stub("a", new Error("x")))], new MemoryUsageStore())
    const snap = await c.fetchOdds("nfl", NOW)
    assert.equal(planPublication(snap, NOW, new Set()).drafts.length, 0)
  })
  it("matches the same game across vendors with home/away flipped, and re-orients it", () => {
    const a = mockEvent("nfl", 1, start)
    const b = { ...mockEvent("nfl", 1, new Date(start.getTime() + 60_000)), homeName: a.awayName, awayName: a.homeName }
    assert.equal(sameEvent(a, b), true)
    b.markets[0]!.outcomes = [
      { selection: "home", quotes: [{ book: "z", price: 130, point: null }] },
      { selection: "away", quotes: [{ book: "z", price: -150, point: null }] },
    ]
    const merged = mergeSnapshots([a], [b])
    const home = merged[0]!.markets[0]!.outcomes.find((o) => o.selection === "home")!
    assert.ok(home.quotes.some((q) => q.book === "z" && q.price === -150))
  })
  it("does not double count a book that both vendors list", () => {
    const merged = mergeSnapshots([mockEvent("nfl", 1, start)], [mockEvent("nfl", 1, start)])
    assert.equal(merged[0]!.markets[0]!.outcomes[0]!.quotes.length, 4)
  })
  it("caches repeat calls and survives an empty answer", async () => {
    let n = 0
    let t = 0
    const inner: OddsProvider = {
      name: "i",
      async fetchOdds() {
        n++
        return { provider: "i", fetchedAt: NOW, events: n === 2 ? [] : rich() }
      },
    }
    const cached = withSnapshotCache(inner, 1000, () => t)
    await cached.fetchOdds("nfl", NOW)
    await cached.fetchOdds("nfl", NOW)
    assert.equal(n, 1)
    t = 2000
    assert.equal((await cached.fetchOdds("nfl", NOW)).events.length, 1)
    assert.equal(n, 2)
  })
})
