import assert from "node:assert/strict"
import { test } from "node:test"
import { checkLeagueSettings } from "./league-settings.ts"

const now = new Date("2026-10-19T12:00:00Z")
const base = { endsAt: new Date("2026-11-19T12:00:00Z"), sports: ["nfl", "nba"] }

test("parlay limit: whole numbers 1 to 60, or null to follow the single limit", () => {
  assert.equal(checkLeagueSettings({ maxParlayStakePct: 5 }, base, now), null)
  assert.equal(checkLeagueSettings({ maxParlayStakePct: null }, base, now), null)
  assert.ok(checkLeagueSettings({ maxParlayStakePct: 0 }, base, now))
  assert.ok(checkLeagueSettings({ maxParlayStakePct: 61 }, base, now))
  assert.ok(checkLeagueSettings({ maxParlayStakePct: 2.5 }, base, now))
})

test("sports: at least one, no duplicates, only known sports", () => {
  assert.equal(checkLeagueSettings({ sports: ["nfl", "epl", "wnba"] }, base, now), null)
  assert.equal(checkLeagueSettings({ sports: [] }, base, now), "Keep at least one sport")
  assert.ok(checkLeagueSettings({ sports: ["nfl", "nfl"] }, base, now))
  assert.equal(checkLeagueSettings({ sports: ["quidditch"] }, base, now), "That sport isn't supported")
})

test("end date: later than the current one, or null for no end; a league with no end has nothing to extend", () => {
  assert.equal(checkLeagueSettings({ endsAt: new Date("2026-12-19T12:00:00Z") }, base, now), null)
  assert.equal(checkLeagueSettings({ endsAt: null }, base, now), null)
  assert.ok(checkLeagueSettings({ endsAt: new Date("2026-11-01T12:00:00Z") }, base, now))
  assert.ok(checkLeagueSettings({ endsAt: new Date("2026-12-19T12:00:00Z") }, { ...base, endsAt: null }, now))
})

test("a patch with nothing to check passes", () => {
  assert.equal(checkLeagueSettings({}, base, now), null)
})
