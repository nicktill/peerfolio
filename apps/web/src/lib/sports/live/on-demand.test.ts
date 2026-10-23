import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { needsOnDemand, onDemandView, type Fetchers } from "./on-demand.ts"
import type { LiveInput } from "./store.ts"
import { buildLiveView, type QuoteRow } from "./view.ts"

const NOW = new Date("2026-10-20T20:00:00Z")
const event = { id: "ev-bos", externalId: "x1", sport: "nba", status: "scheduled", startsAt: new Date("2026-10-20T19:00:00Z"), homeName: "Boston Celtics", awayName: "Detroit Pistons" }
const input = (over: Partial<LiveInput> = {}): LiveInput => ({ eventId: event.id, eventStatus: "scheduled", sport: "nba", quotes: [], state: null, event, ...over })

function fetchers(opts: { mid?: number; fail?: boolean } = {}) {
  const calls: string[] = []
  const f: Fetchers = {
    getJson: async (url) => {
      calls.push(url)
      if (opts.fail) throw new Error("down")
      if (url.includes("gamma-api")) {
        return [{ slug: "nba-det-bos", title: "Pistons vs. Celtics", live: true, ended: false, score: "50-54", period: "Q2", elapsed: "05:12", startTime: "2026-10-20T19:00:00Z", markets: [{ sportsMarketType: "moneyline", outcomes: '["Pistons","Celtics"]', clobTokenIds: '["t-det","t-bos"]', acceptingOrders: true }] }]
      }
      if (url.includes("kalshi") || url.includes("espn")) return { events: [] }
      throw new Error(`unexpected ${url}`)
    },
    postJson: async (url, body) => {
      calls.push(`POST ${url}`)
      if (opts.fail) throw new Error("down")
      const mid = opts.mid ?? 0.6
      return (body as { token_id: string }[]).map(({ token_id }) => {
        const m = token_id === "t-bos" ? mid : 1 - mid
        return { asset_id: token_id, timestamp: String(NOW.getTime() - 500), bids: [{ price: String(m - 0.01), size: "500" }], asks: [{ price: String(m + 0.01), size: "500" }] }
      })
    },
  }
  return { f, calls }
}

describe("on-demand live view (display only)", () => {
  it("a live game with no stored quote gets live odds and the score from one in-memory read", async () => {
    const { f } = fetchers()
    const view = await onDemandView(input(), NOW, f)
    assert.ok(view)
    assert.equal(view.odds.status, "ok")
    if (view.odds.status === "ok") {
      assert.equal(view.odds.source, "polymarket")
      assert.equal(view.odds.freshness, "live")
      assert.ok(Math.abs(view.odds.homeProb - 0.6) < 0.01)
    }
    assert.deepEqual(view.score, { home: 54, away: 50 })
  })

  it("fresh rows win over stale stored ones", async () => {
    const stale: QuoteRow[] = (["home", "away"] as const).map((selection) => ({ market: "moneyline", selection, source: "polymarket", bid: selection === "home" ? 0.3 : 0.68, ask: selection === "home" ? 0.32 : 0.7, mid: null, sourceTs: new Date(NOW.getTime() - 9 * 60_000), fetchedTs: new Date(NOW.getTime() - 9 * 60_000) }))
    const view = await onDemandView(input({ quotes: stale }), NOW, fetchers({ mid: 0.6 }).f)
    assert.ok(view && view.odds.status === "ok" && Math.abs(view.odds.homeProb - 0.6) < 0.01)
  })

  it("makes no upstream call for a game outside its live window", async () => {
    const { f, calls } = fetchers()
    const later = { ...event, startsAt: new Date(NOW.getTime() + 3 * 3600_000) }
    assert.equal(await onDemandView(input({ event: later }), NOW, f), null)
    assert.deepEqual(calls, [])
  })

  it("an upstream outage yields nothing (the stored view is served instead)", async () => {
    assert.equal(await onDemandView(input(), NOW, fetchers({ fail: true }).f), null)
  })

  it("is only wanted while the stored odds are not live and the game is not over", () => {
    const fresh: QuoteRow[] = (["home", "away"] as const).map((selection) => ({ market: "moneyline", selection, source: "polymarket", bid: selection === "home" ? 0.59 : 0.39, ask: selection === "home" ? 0.61 : 0.41, mid: null, sourceTs: new Date(NOW.getTime() - 2_000), fetchedTs: new Date(NOW.getTime() - 2_000) }))
    assert.equal(needsOnDemand(buildLiveView(input({ quotes: fresh }), NOW)), false)
    assert.equal(needsOnDemand(buildLiveView(input(), NOW)), true)
    assert.equal(needsOnDemand(buildLiveView(input({ eventStatus: "final" }), NOW)), false)
  })
})
