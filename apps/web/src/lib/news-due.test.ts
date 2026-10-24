import { test } from "node:test"
import assert from "node:assert/strict"
import { briefTargets, briefingSlot } from "./news-brief.ts"
import { newsDueFromStatus, type NewsStatus } from "./news-due.ts"

const STALE_MS = 20 * 60_000
const at = (iso: string) => new Date(iso)

/** Everything current at `now`: fresh headlines, the latest recaps, and the current intraday slot written. */
function upToDate(now: Date): NewsStatus {
  const targets = briefTargets(now)
  const slot = briefingSlot(now)
  return {
    fetchedAt: new Date(now.getTime() - 60_000).toISOString(),
    day: targets.day ? [targets.day] : [],
    week: targets.week ? [targets.week] : [],
    midday: slot?.period === "midday" ? [{ periodEnd: slot.date, createdAt: new Date(slot.scheduledAt.getTime() + 60_000).toISOString() }] : [],
  }
}

test("nothing is due when headlines are fresh and every recap and slot is written", () => {
  for (const iso of ["2026-10-10T15:00:00Z", "2026-10-06T17:30:00Z", "2026-10-12T22:00:00Z"]) {
    assert.equal(newsDueFromStatus(upToDate(at(iso)), at(iso), STALE_MS), false, iso)
  }
})

test("no headlines, or headlines older than the stale window, are due", () => {
  const now = at("2026-10-10T15:00:00Z") // Saturday: no intraday slot
  assert.equal(newsDueFromStatus({ ...upToDate(now), fetchedAt: null }, now, STALE_MS), true)
  assert.equal(newsDueFromStatus({ ...upToDate(now), fetchedAt: new Date(now.getTime() - STALE_MS - 1000).toISOString() }, now, STALE_MS), true)
  assert.equal(newsDueFromStatus({ ...upToDate(now), fetchedAt: new Date(now.getTime() - STALE_MS + 1000).toISOString() }, now, STALE_MS), false)
})

test("a missing daily or weekly recap is due", () => {
  const now = at("2026-10-12T22:00:00Z") // Monday evening: day 2026-10-12, week 2026-10-09
  assert.equal(newsDueFromStatus({ ...upToDate(now), day: ["2026-10-09"] }, now, STALE_MS), true)
  assert.equal(newsDueFromStatus({ ...upToDate(now), week: ["2026-10-02"] }, now, STALE_MS), true)
  // Older entries alongside the target don't matter.
  assert.equal(newsDueFromStatus({ ...upToDate(now), day: ["2026-10-12", "2026-10-09", "2026-10-08"] }, now, STALE_MS), false)
})

test("an intraday slot is due until a briefing written after it exists", () => {
  const now = at("2026-10-06T17:30:00Z") // Tuesday, 1:30pm ET: the noon slot
  const slot = briefingSlot(now)!
  assert.equal(slot.period, "midday")
  const status = upToDate(now)
  assert.equal(newsDueFromStatus({ ...status, midday: [] }, now, STALE_MS), true)
  assert.equal(newsDueFromStatus({ ...status, midday: [{ periodEnd: slot.date, createdAt: new Date(slot.scheduledAt.getTime() - 60_000).toISOString() }] }, now, STALE_MS), true)
  assert.equal(newsDueFromStatus({ ...status, midday: [{ periodEnd: "2026-10-05", createdAt: now.toISOString() }] }, now, STALE_MS), true)
})
