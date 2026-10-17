import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { consensusTwoWay } from "./odds.ts"
import { DEFAULT_PUBLISH, detectMove, draftMarket, freshDrafts, lockAtFor, planPublication, planSchedule } from "./lines.ts"
import { bucketOf, LIMITS, withinLimit } from "./rate-limit.ts"
import { mirroredPairs } from "./report.ts"
import { gradePick, resolveResult, resultsForEvent } from "./settlement.ts"
import { mockEvent } from "./providers/mock.ts"
import { normalizeOddsApiEvent } from "./providers/the-odds-api.ts"
import type { EventResult } from "./types.ts"

const NOW = new Date("2026-10-18T12:00:00Z")
const hours = (h: number) => new Date(NOW.getTime() + h * 3600_000)
const snap = (events = [mockEvent("nfl", 1, hours(10))]) => ({ provider: "t", fetchedAt: NOW, events })

describe("publish window and locks (must-fix 1, 2)", () => {
  it("publishes only within 24h of kickoff", () => {
    assert.ok(planPublication(snap([mockEvent("nfl", 1, hours(23))]), NOW, new Set()).drafts.length > 0)
    assert.equal(planPublication(snap([mockEvent("nfl", 1, hours(25))]), NOW, new Set()).drafts.length, 0)
  })
  it("locks games and props exactly at the start, never after it", () => {
    for (const kind of ["moneyline", "spread", "total", "player_prop"] as const) {
      assert.equal(lockAtFor(hours(10), kind).getTime(), hours(10).getTime())
    }
  })
  it("publishes only while at least minOpenMs of picking window remains (lock = start)", () => {
    // 61 minutes out: offered. 59 minutes out: a market first seen this late is not published at all.
    assert.ok(planPublication(snap([mockEvent("nfl", 1, new Date(NOW.getTime() + 61 * 60_000))]), NOW, new Set()).drafts.length > 0)
    assert.equal(planPublication(snap([mockEvent("nfl", 1, new Date(NOW.getTime() + 59 * 60_000))]), NOW, new Set()).drafts.length, 0)
  })
  it("freezes a market when the fresh consensus moved past the threshold", () => {
    const draft = planPublication(snap(), NOW, new Set()).drafts.find((d) => d.kind === "spread")!
    const stored = { kind: draft.kind, lockAt: draft.lockAt, fairProbA: draft.fairProbA, pointA: draft.lines[0].point }
    assert.equal(detectMove(stored, draft), null)
    assert.equal(detectMove(stored, { ...draft, fairProbA: draft.fairProbA + 0.05 }), "line moved")
    assert.equal(detectMove(stored, { ...draft, lines: [{ ...draft.lines[0], point: draft.lines[0].point! - 1 }, draft.lines[1]] }), "line moved")
  })
  it("builds fresh drafts only from a fresh snapshot", () => {
    assert.ok(freshDrafts(snap(), NOW).size > 0)
    assert.equal(freshDrafts({ ...snap(), fetchedAt: hours(-1) }, NOW).size, 0)
  })
})

describe("start-time changes (must-fix 3)", () => {
  const market = { kind: "moneyline" as const, lockAt: lockAtFor(hours(10), "moneyline") }
  it("pulls the lock earlier when the start moves earlier", () => {
    const plan = planSchedule(market, hours(6), NOW)
    assert.equal(plan.lockAt.getTime(), lockAtFor(hours(6), "moneyline").getTime())
    assert.equal(plan.freeze, null)
  })
  it("freezes at once if the new lock has already passed", () => {
    assert.equal(planSchedule(market, hours(-1), NOW).freeze, "start moved earlier")
  })
  it("never pushes a lock later", () => {
    assert.equal(planSchedule(market, hours(30), NOW).lockAt.getTime(), market.lockAt.getTime())
  })
})

describe("tennis (must-fix 4)", () => {
  it("offers no total games unless the flag is on", () => {
    const e = mockEvent("tennis", 1, hours(10))
    assert.ok(planPublication(snap([e]), NOW, new Set()).drafts.every((d) => d.kind === "moneyline"))
    assert.ok(planPublication(snap([e]), NOW, new Set(), { ...DEFAULT_PUBLISH, tennisTotals: true }).drafts.some((d) => d.kind === "total"))
  })
  it("an equal tennis score voids instead of pushing", () => {
    const r: EventResult = { source: "s", externalId: "e", status: "final", homeScore: 1, awayScore: 1 }
    const line = { kind: "moneyline" as const, selection: "home" as const, point: null, player: null, statKey: null }
    assert.equal(gradePick({ ...line, sport: "tennis" }, r), "void")
    assert.equal(gradePick({ ...line, sport: "nfl" }, r), "push")
  })
})

describe("results matching and independence (must-fix 4, 5)", () => {
  const event = { externalId: "ours", homeName: "Kansas City Chiefs", awayName: "Buffalo Bills", startsAt: hours(-5) }
  const theirs = (over: Partial<EventResult>): EventResult => ({
    source: "vendor2",
    externalId: "theirs",
    status: "final",
    homeScore: 20,
    awayScore: 27,
    homeName: "Buffalo Bills",
    awayName: "Kansas City Chiefs",
    startsAt: hours(-5),
    ...over,
  })
  it("matches a second vendor by names and time, and re-orients a flipped listing", () => {
    const { results, matched } = resultsForEvent(event, [theirs({})])
    assert.equal(results.length, 1)
    assert.deepEqual([results[0]!.homeScore, results[0]!.awayScore], [27, 20])
    assert.deepEqual(matched, { vendor2: "theirs" })
  })
  it("does not match a different game or a far-off start", () => {
    assert.equal(resultsForEvent(event, [theirs({ homeName: "Other", awayName: "Team" })]).results.length, 0)
    assert.equal(resultsForEvent(event, [theirs({ startsAt: hours(40) })]).results.length, 0)
  })
  it("uses a stored alias once learned", () => {
    const { results } = resultsForEvent({ ...event, aliases: { vendor2: "theirs" } }, [theirs({ homeName: undefined, awayName: undefined, startsAt: undefined })])
    assert.equal(results.length, 1)
  })
  const ctx = { now: NOW, startsAt: hours(-20), finalFirstSeenAt: hours(-10) }
  const fin = (source: string, family?: string): EventResult => ({ source, family, externalId: "e", status: "final", homeScore: 27, awayScore: 20 })
  it("counts vendors that share an upstream family as one source", () => {
    assert.equal(resolveResult([fin("odds", "odds-api"), fin("propline", "odds-api")], ctx).kind, "wait")
    assert.equal(resolveResult([fin("odds", "odds-api"), fin("espn", "espn")], ctx).kind, "final")
  })
  it("a retirement next to an agreed final goes to review, never auto-void", () => {
    const retired: EventResult = { source: "c", externalId: "e", status: "retired", homeScore: null, awayScore: null }
    assert.equal(resolveResult([fin("a"), fin("b"), retired], ctx).kind, "review")
  })
  it("voids a game nobody ever finalised, long after its start", () => {
    assert.equal(resolveResult([], { ...ctx, startsAt: hours(-80) }).kind, "void")
    assert.equal(resolveResult([], { ...ctx, startsAt: hours(-30) }).kind, "wait")
  })
})

describe("provider payload safety (must-fix 6, should-fix)", () => {
  it("ignores non-finite prices from a provider", () => {
    const e = normalizeOddsApiEvent(
      { id: "x", commence_time: "2026-10-25T17:00:00Z", home_team: "A", away_team: "B", bookmakers: [{ key: "k", markets: [{ key: "h2h", outcomes: [{ name: "A", price: Number.NaN }, { name: "B", price: 120 }] }] }] },
      "nfl",
    )
    assert.equal(e.markets[0]!.outcomes.find((o) => o.selection === "home"), undefined)
  })
  it("drops a stale single-book quote", () => {
    const q = (book: string, at: Date) => ({ book, price: -110, point: null, at })
    const a = [q("1", NOW), q("2", NOW), q("3", NOW), q("4", hours(-3))]
    const withOld = consensusTwoWay(a, a, { minBooks: 3, outlierDistance: 0.06, maxQuoteAgeMs: 15 * 60_000, now: NOW })!
    assert.equal(withOld.booksUsed, 3)
    assert.equal(consensusTwoWay(a.slice(0, 2).concat(a[3]!), a.slice(0, 2).concat(a[3]!), { minBooks: 3, outlierDistance: 0.06, maxQuoteAgeMs: 15 * 60_000, now: NOW }), null)
  })
  it("drafting needs enough fresh books", () => {
    const e = mockEvent("nfl", 1, hours(10))
    for (const m of e.markets) for (const o of m.outcomes) o.quotes = o.quotes.map((x, i) => ({ ...x, at: i < 2 ? NOW : hours(-5) }))
    assert.equal(draftMarket(e, e.markets[0]!, DEFAULT_PUBLISH, NOW), null)
  })
})

describe("join limiter and collusion report (should-fix)", () => {
  it("counts in fixed windows shared by every server, and limits all three actions", () => {
    const w = LIMITS.join.windowMs
    assert.equal(bucketOf(new Date(0), w), bucketOf(new Date(w - 1), w))
    assert.notEqual(bucketOf(new Date(0), w), bucketOf(new Date(w), w))
    assert.equal(withinLimit(LIMITS.join.max, LIMITS.join.max), true)
    assert.equal(withinLimit(LIMITS.join.max + 1, LIMITS.join.max), false)
    assert.deepEqual(Object.keys(LIMITS).sort(), ["create", "join", "pick"])
  })
  it("finds members who keep taking opposite sides", () => {
    const picks = ["m1", "m2", "m3"].flatMap((m) => [
      { memberId: "a", marketId: m, selection: "home" },
      { memberId: "b", marketId: m, selection: "away" },
      { memberId: "c", marketId: m, selection: "home" },
    ])
    const pairs = mirroredPairs(picks)
    assert.deepEqual(pairs.map((p) => [p.a, p.b, p.markets]), [["a", "b", 3], ["b", "c", 3]])
    assert.equal(mirroredPairs(picks, 4).length, 0)
  })
})
