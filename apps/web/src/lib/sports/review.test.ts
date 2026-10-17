import assert from "node:assert/strict"
import { test } from "node:test"
import { planPublication, DEFAULT_PUBLISH, lockAtFor } from "./lines.ts"
import { resolveConfigForTest } from "./review-helpers.ts"
import { resolveResult, gradePick } from "./settlement.ts"
import { mockEvent } from "./providers/mock.ts"
import type { EventResult } from "./types.ts"

const now = new Date("2026-10-16T12:00:00Z")
const fin = (source: string, h: number, a: number): EventResult => ({ source, externalId: "e", status: "final", homeScore: h, awayScore: a })

test("one source saying cancelled must not void a game two sources agree is final", () => {
  const r = resolveResult(
    [fin("a", 27, 20), fin("b", 27, 20), { source: "c", externalId: "e", status: "cancelled", homeScore: null, awayScore: null }],
    { now, startsAt: new Date(now.getTime() - 20 * 3600_000), finalFirstSeenAt: new Date(now.getTime() - 10 * 3600_000) },
    resolveConfigForTest(),
  )
  assert.notEqual(r.kind, "void")
})

test("a NaN score (unparseable provider payload) is never treated as a final", () => {
  const r = resolveResult(
    [fin("a", Number.NaN, 20), fin("b", Number.NaN, 20)],
    { now, startsAt: new Date(now.getTime() - 20 * 3600_000), finalFirstSeenAt: new Date(now.getTime() - 10 * 3600_000) },
    resolveConfigForTest(),
  )
  assert.notEqual(r.kind, "final")
  assert.equal(gradePick({ kind: "moneyline", selection: "home", point: null, player: null, statKey: null }, fin("a", Number.NaN, 20)), "void")
})

test("lines are not published days before kickoff (stale-line window)", () => {
  const snap = { provider: "t", fetchedAt: now, events: [mockEvent("nfl", 1, new Date(now.getTime() + 6 * 24 * 3600_000))] }
  const plan = planPublication(snap, now, new Set(), DEFAULT_PUBLISH)
  assert.equal(plan.drafts.length, 0, "6-day-out markets get a line that is frozen for ~6 days")
})

test("NFL props lock before inactives are announced (90 min before kickoff)", () => {
  const start = new Date("2026-10-18T17:00:00Z")
  const lock = lockAtFor(start, "player_prop")
  assert.ok(start.getTime() - lock.getTime() >= 100 * 60_000, "prop lock is only 60 min before kickoff, after inactives")
})
