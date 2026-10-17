import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DEFAULT_PUBLISH, missingReason } from "./lines.ts"
import { resolveResult, resultsForEvent } from "./settlement.ts"
import { createCompositeOdds } from "./providers/composite.ts"
import { MemoryUsageStore, DEFAULT_PLAN } from "./credit-budget.ts"
import { mockEvent } from "./providers/mock.ts"
import { withDeadlockRetry } from "./store.ts"
import type { EventResult, OddsProvider } from "./types.ts"

const NOW = new Date("2026-10-18T12:00:00Z")
const hours = (h: number) => new Date(NOW.getTime() + h * 3600_000)

describe("B: orientation is decided from names on every run", () => {
  const t = hours(-5)
  const ev = { externalId: "o1", homeName: "Celtics", awayName: "Knicks", startsAt: t }
  const v2: EventResult = { source: "v2", family: "fb", externalId: "v77", status: "final", homeName: "Knicks", awayName: "Celtics", startsAt: t, homeScore: 90, awayScore: 100 }
  it("keeps swapping after the alias is learned", () => {
    const first = resultsForEvent(ev, [v2])
    assert.equal(first.results[0]!.homeScore, 100)
    const again = resultsForEvent({ ...ev, aliases: first.matched }, [v2])
    assert.equal(again.results[0]!.homeScore, 100)
    assert.equal(again.results[0]!.awayScore, 90)
  })
})

describe("C: id matches are scoped and time-checked", () => {
  const t = hours(-5)
  const ev = { externalId: "same", homeName: "A", awayName: "B", startsAt: t, aliases: { _family: "the-odds-api" } }
  const r = (over: Partial<EventResult>): EventResult => ({ source: "x", externalId: "same", status: "final", homeScore: 1, awayScore: 0, ...over })
  it("an equal id from another family is not our game", () => {
    assert.equal(resultsForEvent(ev, [r({ family: "espn" })]).results.length, 0)
    assert.equal(resultsForEvent(ev, [r({ family: "the-odds-api" })]).results.length, 1)
  })
  it("an alias only matches its own source and only inside the time window", () => {
    const withAlias = { ...ev, aliases: { _family: "the-odds-api", espn: "e9" } }
    assert.equal(resultsForEvent(withAlias, [r({ source: "espn", externalId: "e9", startsAt: t })]).results.length, 1)
    assert.equal(resultsForEvent(withAlias, [r({ source: "other", externalId: "e9", startsAt: t })]).results.length, 0)
    assert.equal(resultsForEvent(withAlias, [r({ source: "espn", externalId: "e9", startsAt: hours(30) })]).results.length, 0)
  })
})

describe("D: outages are not results, and review times out", () => {
  const ctx = { now: NOW, startsAt: hours(-80), finalFirstSeenAt: null as Date | null }
  it("does not void a game after an outage (no source answered)", () => {
    assert.equal(resolveResult([], { ...ctx, sourcesAnswered: 0 }).kind, "wait")
  })
  it("voids only when sources answered and still have no final", () => {
    assert.equal(resolveResult([], { ...ctx, sourcesAnswered: 1 }).kind, "void")
  })
  it("refunds a game stuck in review after the timeout", () => {
    const fin = (source: string, h: number): EventResult => ({ source, externalId: "e", status: "final", homeScore: h, awayScore: 0 })
    assert.equal(resolveResult([fin("a", 3), fin("b", 4)], { ...ctx, startsAt: hours(-48), sourcesAnswered: 2 }).kind, "review")
    const late = resolveResult([fin("a", 3), fin("b", 4)], { ...ctx, startsAt: hours(-24 * 8), sourcesAnswered: 2 })
    assert.equal(late.kind, "void")
    assert.match((late as { reason: string }).reason, /review timeout/)
  })
})

describe("E: markets that disappear from a trustworthy feed", () => {
  const e = mockEvent("nfl", 1, hours(10))
  const snap = (over = {}) => ({ provider: "t", fetchedAt: NOW, events: [e], ...over })
  const propKey = `${e.markets.find((m) => m.kind === "player_prop")!.key}|${e.markets.find((m) => m.kind === "player_prop")!.player}`
  it("flags an event that is gone and a prop that was pulled", () => {
    assert.equal(missingReason(snap(), NOW, "other-event", "moneyline|"), "event no longer offered")
    assert.equal(missingReason(snap(), NOW, e.externalId, "player_pass_yds|Nobody"), "market no longer offered")
    assert.equal(missingReason(snap(), NOW, e.externalId, propKey), null)
  })
  it("proves nothing from an empty, stale or incomplete snapshot", () => {
    assert.equal(missingReason(snap({ events: [] }), NOW, e.externalId, "moneyline|"), null)
    assert.equal(missingReason(snap({ fetchedAt: hours(-1) }), NOW, "gone", "moneyline|", DEFAULT_PUBLISH), null)
    assert.equal(missingReason(snap({ complete: false }), NOW, "gone", "moneyline|"), null)
  })
  it("the composite marks a snapshot incomplete when a source failed", async () => {
    const down: OddsProvider = { name: "down", async fetchOdds() { throw new Error("x") } }
    const ok: OddsProvider = { name: "ok", async fetchOdds() { return { provider: "ok", fetchedAt: NOW, events: [] } } }
    const mk = (provider: OddsProvider) => ({ provider, plan: DEFAULT_PLAN, cost: () => 1 })
    const s = await createCompositeOdds([mk(down), mk(ok)], new MemoryUsageStore()).fetchOdds("nfl", NOW)
    assert.equal(s.complete, false)
  })
})

describe("A: deadlock retry", () => {
  it("retries a 40P01 (also when wrapped in a cause) a bounded number of times", async () => {
    let n = 0
    const out = await withDeadlockRetry(async () => {
      if (++n < 3) throw Object.assign(new Error("wrapped"), { cause: { code: "40P01" } })
      return "ok"
    })
    assert.deepEqual([out, n], ["ok", 3])
    let m = 0
    await assert.rejects(withDeadlockRetry(async () => { m++; throw Object.assign(new Error("d"), { code: "40P01" }) }, 3))
    assert.equal(m, 3)
  })
  it("does not retry other errors", async () => {
    let n = 0
    await assert.rejects(withDeadlockRetry(async () => { n++; throw new Error("nope") }))
    assert.equal(n, 1)
  })
})
