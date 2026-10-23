import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isComingUp, isUpcoming, upcomingPage, UPCOMING_PAGE_SIZE } from "./upcoming.ts"

const now = Date.parse("2026-10-22T23:43:00Z")
const starts = (hours: number) => new Date(now + hours * 3600_000).toISOString()

describe("upcoming pick screen", () => {
  it("keeps near unpriced games but excludes the multi-day schedule, started games and invalid times", () => {
    assert.ok(isUpcoming(starts(0.1), now))
    assert.ok(isUpcoming(starts(24), now))
    for (const start of [starts(-1), starts(0), starts(24.01), starts(48), "invalid"]) {
      assert.equal(isUpcoming(start, now), false, start)
    }
  })

  it("caps the whole list across midnight rather than showing a preview for every day", () => {
    const games = Array.from({ length: 100 }, (_, id) => ({ id, startsAt: starts(id / 4 + 0.1), priced: id % 3 === 0 }))
      .filter((g) => isUpcoming(g.startsAt, now))
    const first = upcomingPage(games, UPCOMING_PAGE_SIZE, () => false)
    assert.equal(first.length, 12)
    assert.deepEqual(first.map((g) => g.id), Array.from({ length: 12 }, (_, i) => i))
    assert.ok(first.some((g) => !g.priced))
    const next = upcomingPage(games, UPCOMING_PAGE_SIZE * 2, () => false)
    assert.equal(next.length, 24)
    assert.deepEqual(next.slice(0, 12), first)
    assert.equal(games.length, 96)
  })

  it("keeps the selected game when collapsing without expanding every remaining game", () => {
    const games = Array.from({ length: 50 }, (_, id) => ({ id }))
    const page = upcomingPage(games, UPCOMING_PAGE_SIZE, (g) => g.id === 40)
    assert.equal(page.length, 13)
    assert.equal(page.at(-1)?.id, 40)
    assert.equal(upcomingPage(games, UPCOMING_PAGE_SIZE, (g) => g.id === 3).length, 12)
    assert.equal(games.length, 50)
    const selectedLegs = new Set([30, 40])
    const parlayPage = upcomingPage(games, UPCOMING_PAGE_SIZE, (g) => selectedLegs.has(g.id))
    assert.equal(parlayPage.length, 14)
    assert.deepEqual(parlayPage.slice(-2).map((g) => g.id), [30, 40])
  })
})

describe("Live Coming up", () => {
  it("retains overdue tennis for less than five hours while bounding future schedules", () => {
    assert.ok(isComingUp({ sport: "tennis", startsAt: starts(-2) }, now))
    assert.ok(isComingUp({ sport: "tennis", startsAt: starts(0) }, now))
    assert.equal(isComingUp({ sport: "tennis", startsAt: starts(-5) }, now), false)
    assert.equal(isComingUp({ sport: "nba", startsAt: starts(-2) }, now), false)
    assert.equal(isComingUp({ sport: "tennis", startsAt: starts(25) }, now), false)
    assert.equal(isComingUp({ sport: "tennis", startsAt: "invalid" }, now), false)
  })
})
