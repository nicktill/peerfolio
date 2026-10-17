import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { lockAtFor, planPublication, DEFAULT_PUBLISH } from "./lines.ts"
import { EspnResultsProvider, normalizeScoreboard } from "./providers/espn.ts"
import { createCompositeOdds } from "./providers/composite.ts"
import { normalizeOddsApiEvent, TheOddsApiProvider } from "./providers/the-odds-api.ts"
import { MemoryUsageStore, DEFAULT_PLAN, estimateCredits } from "./credit-budget.ts"
import { DEFAULT_RESOLVE, gradePick, resolveResult, resultsForEvent } from "./settlement.ts"
import type { EventResult, OddsSnapshot } from "./types.ts"

/**
 * Gaps found while checking the picks flow against real data (2026-10-17):
 * ESPN's live payload shape, retirements and stuck results, the Odds API call/credit accounting with two keys,
 * and start/lock times across daylight saving. Nothing here needs a network, a key or a database.
 */

const live = JSON.parse(readFileSync(new URL("./providers/fixtures/espn-2026-10-17.json", import.meta.url), "utf8"))
const H = 3600_000

describe("ESPN: a payload recorded from the live scoreboards on 2026-10-17", () => {
  it("parses a real NFL final and a scheduled game into our event shape", () => {
    const rs = normalizeScoreboard(live.nfl, "nfl")
    const final = rs.find((r) => r.status === "final")!
    assert.deepEqual([final.homeName, final.awayName, final.homeScore, final.awayScore, final.family], ["Denver Broncos", "Seattle Seahawks", 17, 14, "espn"])
    assert.equal(final.startsAt!.toISOString(), "2026-10-16T00:15:00.000Z")
    assert.equal(rs.find((r) => r.status === "scheduled")!.homeScore, null)
  })

  it("keeps real tennis retirements, walkovers and cancellations out of the finals", () => {
    const rs = normalizeScoreboard(live.tennis, "tennis")
    const by = (id: string) => rs.find((r) => r.externalId === id)!
    assert.deepEqual([by("186308").status, by("186308").homeScore, by("186308").awayScore], ["final", 1, 2]) // sets won, away name listed first on ESPN
    assert.equal(by("186292").status, "retired")
    assert.equal(by("186292").homeScore, null)
    assert.equal(by("184927").status, "retired") // STATUS_WALKOVER
    assert.equal(by("186365").status, "retired")
    assert.equal(by("184947").status, "scheduled")
  })

  it("drops doubles that ESPN lists with team rosters, so only singles can match our events", () => {
    const rs = normalizeScoreboard(live.tennis, "tennis")
    assert.equal(rs.some((r) => r.externalId === "184982" || r.externalId === "185388"), false)
  })

  it("matches a real ESPN game to an event that carries the Odds API's id, by names and time", () => {
    const all = normalizeScoreboard(live.nfl, "nfl")
    const ours = { externalId: "odds-api-abc", homeName: "Denver Broncos", awayName: "Seattle Seahawks", startsAt: new Date("2026-10-16T00:15:00Z"), aliases: { _family: "the-odds-api" } }
    const { results, matched } = resultsForEvent(ours, all)
    assert.equal(results.length, 1)
    assert.equal(matched.espn, "401872995")
  })

  it("asks NFL/NBA one day at a time (ESPN answers a date range with HTTP 400), tennis with one request", async () => {
    const asked: string[] = []
    const spy = (async (u: string) => (asked.push(u), new Response(JSON.stringify({ events: [] })))) as unknown as typeof fetch
    const ev = [{ externalId: "x", homeName: "a", awayName: "b", startsAt: new Date("2026-10-16T00:15:00Z") }]
    await new EspnResultsProvider(spy).fetchResults("nba", ev)
    assert.ok(asked.length >= 3 && asked.every((u) => /dates=\d{8}&/.test(u)), asked.join(" "))
    // ESPN's day is the US Eastern one: a 00:15Z kickoff is listed under the PREVIOUS UTC date. The window must contain it.
    assert.ok(asked.some((u) => u.includes("dates=20261015&")))
    asked.length = 0
    await new EspnResultsProvider(spy).fetchResults("tennis", ev)
    assert.equal(asked.filter((u) => u.includes("tennis/atp")).length, 1)
  })
})

describe("settlement never holds credits forever", () => {
  const ctx = (hoursSinceStart: number) => ({ now: new Date(Date.parse("2026-10-18T17:00:00Z") + hoursSinceStart * H), startsAt: new Date("2026-10-18T17:00:00Z"), finalFirstSeenAt: new Date("2026-10-18T21:00:00Z") })
  const r = (source: string, status: EventResult["status"], h: number | null = null, a: number | null = null): EventResult => ({ source, family: source, externalId: source, status, homeScore: h, awayScore: a })

  it("a tennis retirement reported by one source is refunded once it has been stuck for the review timeout", () => {
    const stuck = [r("espn", "retired"), r("the-odds-api", "final", 1, 0)]
    assert.equal(resolveResult(stuck, ctx(30)).kind, "wait")
    assert.equal(resolveResult(stuck, ctx(24 * 8)).kind, "void")
  })

  it("a final only one family ever reports is refunded after the review timeout, not held forever", () => {
    const lone = [r("the-odds-api", "final", 100, 90)]
    assert.equal(resolveResult(lone, ctx(12)).kind, "wait")
    assert.equal(resolveResult(lone, ctx(24 * 8)).kind, "void")
  })

  it("an outage is still not a reason to refund", () => {
    assert.equal(resolveResult([], { ...ctx(24 * 30), sourcesAnswered: 0 }).kind, "wait")
  })

  it("two sources agreeing still settle normally after the delay", () => {
    const both = [r("espn", "final", 17, 14), r("the-odds-api", "final", 17, 14)]
    assert.equal(resolveResult(both, ctx(12)).kind, "final")
    assert.equal(DEFAULT_RESOLVE.minSources, 2)
  })

  it("a real NFL spread that lands on the margin pushes, and one half point either way decides it", () => {
    const res = r("espn", "final", 17, 14)
    const g = (point: number) => gradePick({ sport: "nfl", kind: "spread", selection: "home", point, player: null, statKey: null }, res)
    assert.deepEqual([g(-3), g(-2.5), g(-3.5)], ["push", "win", "loss"])
  })
})

describe("start and lock times are epoch arithmetic, so daylight saving cannot shift them", () => {
  it("locks 2 hours before kickoff across the US fall-back night, whatever the machine's zone", () => {
    for (const start of ["2026-11-01T06:30:00Z", "2026-11-01T18:00:00Z", "2026-03-08T07:30:00Z", "2026-03-29T00:30:00Z"]) {
      const s = new Date(start)
      assert.equal(s.getTime() - lockAtFor(s, "moneyline").getTime(), 2 * H)
      assert.equal(s.getTime() - lockAtFor(s, "player_prop").getTime(), 2 * H)
    }
  })
  it("parses the offset spellings providers use to the same instant", () => {
    const a = new Date("2026-11-01T13:00:00-05:00").getTime()
    assert.equal(a, new Date("2026-11-01T18:00:00Z").getTime())
    assert.equal(new Date("2026-10-16T00:15Z").getTime(), new Date("2026-10-16T00:15:00.000Z").getTime()) // ESPN omits the seconds
  })
  it("publishes exactly inside the 24h window and not a minute before", () => {
    const start = new Date("2026-11-01T18:00:00Z")
    const ev = { externalId: "e", sport: "nfl" as const, homeName: "A", awayName: "B", startsAt: start, markets: [{ key: "moneyline", kind: "moneyline" as const, outcomes: [{ selection: "home" as const, quotes: ["a", "b", "c"].map((book) => ({ book, price: -150, point: null })) }, { selection: "away" as const, quotes: ["a", "b", "c"].map((book) => ({ book, price: 130, point: null })) }] }] }
    const at = (t: number) => planPublication({ provider: "t", fetchedAt: new Date(t), events: [ev] }, new Date(t), new Set(), DEFAULT_PUBLISH).drafts.length
    assert.equal(at(start.getTime() - 24 * H), 1)
    assert.equal(at(start.getTime() - 24 * H - 60_000), 0)
  })
})

describe("the Odds API adapter: calls, credits and two keys, against recorded-shape payloads", () => {
  const nflEvent = (id: string) => ({
    id, commence_time: "2026-10-18T17:00:00Z", home_team: "Denver Broncos", away_team: "Seattle Seahawks",
    bookmakers: ["draftkings", "fanduel", "betmgm"].map((key) => ({ key, last_update: "2026-10-18T11:55:00Z", markets: [{ key: "h2h", outcomes: [{ name: "Denver Broncos", price: -150 }, { name: "Seattle Seahawks", price: 130 }] }] })),
  })
  const recorder = (answer: (path: string) => unknown, status = 200) => {
    const urls: string[] = []
    const fetchFn = async (u: string) => (urls.push(u), { ok: status === 200, status, json: async () => answer(new URL(u).pathname) })
    return { urls, fetchFn }
  }
  const credits = (urls: string[]) =>
    urls.reduce((n, u) => {
      const url = new URL(u)
      if (/\/sports$|\/events$/.test(url.pathname)) return n // free endpoints
      if (url.pathname.endsWith("/scores")) return n + 2
      return n + (url.searchParams.get("markets") ?? "").split(",").length
    }, 0)

  it("NFL with props: our estimate equals the credits actually spent when 8 events are on the board", async () => {
    const { urls, fetchFn } = recorder((p) => (p.includes("/events/") ? nflEvent("x") : Array.from({ length: 8 }, (_, i) => nflEvent("g" + i))))
    await new TheOddsApiProvider("KEY", fetchFn as never, { includeProps: true, maxPropEvents: 8 }).fetchOdds("nfl", new Date("2026-10-18T12:00:00Z"))
    assert.equal(credits(urls), estimateCredits({ gameMarkets: 3, regions: 1, sportKeys: 1, propMarkets: 4, propEvents: 8 }))
  })

  it("tennis lists active tournaments for free, then pays 3 credits per active tournament key", async () => {
    const { urls, fetchFn } = recorder((p) => (p.endsWith("/sports") ? [{ key: "tennis_atp_shanghai_masters", active: true }, { key: "tennis_wta_wuhan", active: true }, { key: "tennis_atp_old", active: false }, { key: "soccer_epl", active: true }] : []))
    await new TheOddsApiProvider("KEY", fetchFn as never).fetchOdds("tennis", new Date())
    assert.equal(urls.filter((u) => u.includes("/odds")).length, 2)
    assert.equal(credits(urls), 6)
  })

  it("a tennis event keeps player names as home/away and drops an outcome whose name does not match exactly", () => {
    const raw = {
      id: "t1", commence_time: "2026-10-18T09:00:00Z", home_team: "Carlos Alcaraz", away_team: "Jannik Sinner",
      bookmakers: [{ key: "bk", markets: [{ key: "h2h", outcomes: [{ name: "Carlos Alcaraz", price: -120 }, { name: "Jannik  Sinner", price: 100 }] }] }],
    }
    const e = normalizeOddsApiEvent(raw, "tennis")
    assert.equal(e.markets[0]!.outcomes.length, 1, "the spelling mismatch silently leaves a one-sided market, which can never publish")
  })

  it("never puts the key in an error, and an out-of-credits answer is a failure, not an empty slate", async () => {
    const { fetchFn } = recorder(() => ({}), 401)
    await assert.rejects(new TheOddsApiProvider("SECRET-KEY-123", fetchFn as never).fetchOdds("nfl", new Date()), (e: Error) => /401/.test(e.message) && !e.message.includes("SECRET-KEY-123"))
    await assert.rejects(new TheOddsApiProvider("SECRET-KEY-123", fetchFn as never).fetchResults("nfl", [{ externalId: "x", homeName: "a", awayName: "b", startsAt: new Date() }]), (e: Error) => !e.message.includes("SECRET-KEY-123"))
  })

  it("two keys: the second key is only used once the first key's daily pace is used up, and each is charged on its own", async () => {
    const mk = (name: string) => {
      const { urls, fetchFn } = recorder((p) => (p.endsWith("/odds") ? [nflEvent("g")] : []))
      const provider = new TheOddsApiProvider(name + "-key", fetchFn as never, undefined, name)
      return { urls, source: { provider, plan: { ...DEFAULT_PLAN, monthly: 100 }, cost: () => 3 } }
    }
    const a = mk("one"), b = mk("two")
    const usage = new MemoryUsageStore()
    const c = createCompositeOdds([a.source, b.source], usage) // 3 books each, so a second key is never "thin"
    const day = new Date("2026-10-18T12:00:00Z")
    const answers: OddsSnapshot[] = []
    for (let i = 0; i < 8; i++) answers.push(await c.fetchOdds("nfl", new Date(day.getTime() + i * 15 * 60_000)))
    // monthly 100 * 0.9 / 31 days * 2 = 6 credits a day: two fetches of 3 credits on key one, then nothing is left for it.
    assert.equal(a.urls.length, 2)
    assert.deepEqual(await usage.usage("one", day), { month: 6, day: 6 })
    assert.ok(b.urls.length >= 1 || answers.slice(2).every((s) => s.events.length === 0), "after key one is spent the day is either served by key two or empty")
    assert.ok(a.urls.concat(b.urls).every((u) => u.includes("apiKey=")), "keys travel as query parameters only to the provider")
    assert.equal(answers.slice(2).every((s) => s.complete === false || s.events.length > 0), true)
  })
})
