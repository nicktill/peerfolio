import assert from "node:assert/strict"
import { test } from "node:test"
import { formatAge, hiddenSkips, staleness, stuckPickRows, tally } from "./health-report.ts"

const now = new Date("2026-10-18T12:00:00Z")
const ago = (min: number) => new Date(now.getTime() - min * 60_000)

test("staleness levels follow each job's limits", () => {
  assert.equal(staleness("publish", ago(10), now).level, "ok")
  assert.equal(staleness("publish", ago(60), now).level, "warn")
  assert.equal(staleness("publish", ago(200), now).level, "bad")
  assert.equal(staleness("worker", ago(5), now).level, "ok")
  assert.equal(staleness("settle", null, now).level, "bad")
})

test("formatAge is readable", () => {
  assert.equal(formatAge(30_000), "under a minute")
  assert.equal(formatAge(45 * 60_000), "45 min")
  assert.equal(formatAge(5 * 3600_000 + 7 * 60_000), "5h 7m")
  assert.equal(formatAge(72 * 3600_000), "3d")
})

test("hiddenSkips pulls the text after hidden:", () => {
  const out = hiddenSkips([
    { sport: "nfl", notes: ["exchange: 12 of 12 scheduled games priced; hidden: moneyline: price outside range x1; e.g. A @ B"] },
    { sport: "nba", notes: ["no fetch: nothing unlocked"] },
  ])
  assert.deepEqual(out, [{ sport: "nfl", detail: "moneyline: price outside range x1; e.g. A @ B" }])
})

test("stuck picks are oldest first and flag long waits after the final", () => {
  const rows = stuckPickRows(
    [
      { pickId: "a", acceptedAt: ago(100), eventStatus: "scheduled", finalFirstSeenAt: ago(60) },
      { pickId: "b", acceptedAt: ago(900), eventStatus: "scheduled", finalFirstSeenAt: ago(800) },
      { pickId: "c", acceptedAt: ago(500), eventStatus: "scheduled", finalFirstSeenAt: null },
    ],
    now,
  )
  assert.deepEqual(rows.map((r) => r.pickId), ["b", "c", "a"])
  assert.deepEqual(rows.map((r) => r.level), ["bad", "ok", "ok"])
})

test("tally counts and sorts", () => {
  assert.deepEqual(tally(["a", "b", "a", null]), [{ key: "a", count: 2 }, { key: "b", count: 1 }, { key: "none", count: 1 }])
})
