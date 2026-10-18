import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DEFAULT_PLAN, MemoryUsageStore, canSpend } from "./credit-budget.ts"
import { openPickPhase } from "./format.ts"
import { fetchBucket, fetchKind } from "./lines.ts"
import { createCompositeOdds } from "./providers/composite.ts"
import { EspnResultsProvider } from "./providers/espn.ts"
import { TheOddsApiProvider } from "./providers/the-odds-api.ts"
import { DEFAULT_RESOLVE, needsMeteredSource } from "./settlement.ts"
import type { EventResult } from "./types.ts"

const H = 3600_000
const NOW = new Date("2026-10-18T22:00:00Z")
const res = (status: EventResult["status"]): EventResult => ({ source: "espn", externalId: "1", status, homeScore: null, awayScore: null })

describe("settlement asks the metered source only when it can change the outcome", () => {
  const seen = (h: number) => ({ finalFirstSeenAt: new Date(NOW.getTime() - h * H) })
  it("never while a free source shows no final", () => {
    for (const s of ["scheduled", "in_progress", "retired", "postponed", "cancelled"] as const) assert.equal(needsMeteredSource(seen(20), [res(s)], true, NOW), false, s)
    assert.equal(needsMeteredSource({ finalFirstSeenAt: null }, [], true, NOW), false)
  })
  it("not during the settle delay, once after it", () => {
    assert.equal(needsMeteredSource(seen(0.1), [res("final")], true, NOW), false)
    assert.equal(needsMeteredSource({ finalFirstSeenAt: null }, [res("final")], true, NOW), false, "first sight this run")
    assert.equal(needsMeteredSource(seen(DEFAULT_RESOLVE.settleDelayMs / H), [res("final")], true, NOW), true)
  })
  it("with no free source configured it is the only way to settle", () => {
    assert.equal(needsMeteredSource({ finalFirstSeenAt: null }, [], false, NOW), true)
  })
})

describe("tennis credits follow the real number of active tournaments", () => {
  const sports = (n: number) => [...Array.from({ length: n }, (_, i) => ({ key: `tennis_atp_t${i}`, active: true })), { key: "tennis_old", active: false }, { key: "golf_x", active: true }]
  const rig = (tournaments: number) => {
    const urls: string[] = []
    const fetchFn = async (u: string) => (urls.push(u), { ok: true, status: 200, json: async () => (new URL(u).pathname.endsWith("/sports") ? sports(tournaments) : []) })
    return { urls, p: new TheOddsApiProvider("K", fetchFn as never) }
  }
  it("estimate and the credits recorded for the fetch are both 3 per active key (5 tournaments = 15, not the old flat 9)", async () => {
    const { p } = rig(5)
    assert.equal(await p.estimateCost("tennis"), 15)
    assert.equal((await p.fetchOdds("tennis", NOW)).credits, 15)
  })
  it("pacing respects it: 5 tournaments do not fit a 12-credit day, 3 do", async () => {
    const plan = { monthly: 200, safety: 0.9, dayBurst: 2 } // 180 usable, ~12/day
    for (const [n, expectEvents] of [[5, false], [3, true]] as const) {
      const { urls, p } = rig(n)
      const usage = new MemoryUsageStore()
      const snap = await createCompositeOdds([{ provider: p, plan, cost: () => 9 }], usage).fetchOdds("tennis", NOW)
      assert.equal(snap.notes!.some((x) => x.includes("skipped")), !expectEvents)
      assert.equal(urls.some((u) => u.includes("/odds")), expectEvents)
    }
    assert.equal(canSpend({ ...DEFAULT_PLAN, monthly: 200 }, { month: 0, day: 0 }, 15, NOW), false)
  })
  it("records the actual credits, not the estimate, after the fetch", async () => {
    const { p } = rig(2)
    const usage = new MemoryUsageStore()
    await createCompositeOdds([{ provider: p, plan: DEFAULT_PLAN, cost: () => 9 }], usage).fetchOdds("tennis", NOW)
    assert.deepEqual(await usage.usage("the-odds-api", NOW), { month: 6, day: 6 })
  })
  it("scores cost 2 per tournament key and are reported for metering", async () => {
    const { p } = rig(4)
    p.meterResults("the-odds-api:scores", 125)
    await p.fetchResults("tennis", [{ externalId: "x", homeName: "a", awayName: "b", startsAt: NOW }])
    assert.equal(p.metered!.lastCredits(), 8)
    assert.equal(await p.metered!.estimate("tennis"), 8)
  })
})

describe("odds fetches are spent on game windows, not on the clock", () => {
  it("guards while a market is open, discovers when a game is near, otherwise spends nothing", () => {
    assert.equal(fetchKind({ hasUnlockedMarket: true, gameWithin24h: false }), "guard")
    assert.equal(fetchKind({ hasUnlockedMarket: false, gameWithin24h: true }), "discover")
    assert.equal(fetchKind({ hasUnlockedMarket: false, gameWithin24h: null }), "discover")
    assert.equal(fetchKind({ hasUnlockedMarket: false, gameWithin24h: false }), null)
  })
  it("a day of 15-minute runs claims at most 12 guard and 2 discover buckets per sport", () => {
    const claimed = { guard: new Set<number>(), discover: new Set<number>() }
    for (let i = 0; i < 96; i++) {
      const t = new Date(Date.parse("2026-10-18T00:00:00Z") + i * 15 * 60_000)
      claimed.guard.add(fetchBucket("guard", t))
      claimed.discover.add(fetchBucket("discover", t))
    }
    assert.deepEqual([claimed.guard.size, claimed.discover.size], [12, 2])
  })
  it("a late GitHub run in the same window lands in the same bucket", () => {
    assert.equal(fetchBucket("guard", new Date("2026-10-18T14:01:00Z")), fetchBucket("guard", new Date("2026-10-18T15:59:00Z")))
  })
  it("the free ESPN schedule check says yes for a game inside 24h, no for one beyond, null on failure", async () => {
    const board = (date: string) => ({ events: [{ id: "e", date, competitions: [{ id: "c", status: { type: { name: "STATUS_SCHEDULED", state: "pre" } }, competitors: [{ homeAway: "home", team: { displayName: "A" } }, { homeAway: "away", team: { displayName: "B" } }] }] }] })
    const ask = (date: string) => new EspnResultsProvider((async () => new Response(JSON.stringify(board(date)))) as unknown as typeof fetch).hasGameWithin("nfl", NOW)
    assert.equal(await ask("2026-10-19T17:00Z"), true)
    assert.equal(await ask("2026-10-21T17:00Z"), false)
    assert.equal(await new EspnResultsProvider((async () => new Response("no", { status: 503 })) as unknown as typeof fetch).hasGameWithin("nfl", NOW), null)
  })
})

describe("an open pick never claims to be live", () => {
  const start = "2026-10-18T17:00:00Z"
  it("shows the start before it, In progress after it, Awaiting result long after, never Live", () => {
    const at = (h: number) => openPickPhase(start, new Date(Date.parse(start) + h * H), "en-US")
    assert.equal(at(-48).phase, "upcoming")
    assert.match(at(-48).label, /^Starts /)
    assert.deepEqual([at(0).label, at(2).label, at(7).label], ["In progress", "In progress", "Awaiting result"])
    for (const h of [-48, 0, 2, 7]) assert.doesNotMatch(at(h).label, /live/i)
  })
})
