import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isQuiet, quietRefreshAt, QUIET_REFRESH_MS, type QuietCache } from "./plan.ts"

const NOW = Date.parse("2026-10-23T23:00:00Z")
const game = (id: string, startedMinAgo: number) => ({ id, startsAt: new Date(NOW - startedMinAgo * 60_000) })
const cache = (over: Partial<QuietCache> = {}): QuietCache => ({ watched: false, at: NOW - 60_000, rows: [game("a", 30)], ...over })
const none: ReadonlySet<string> = new Set()

describe("quiet mode", () => {
  it("shares the next scheduled awake period, within fifteen minutes for every load time", () => {
    const origin = Date.parse("2026-10-23T22:00:00Z")
    for (let offset = 0; offset < 3600_000; offset += 7_919) {
      const loaded = origin + offset
      const due = quietRefreshAt(loaded)
      assert.ok(due > loaded && due - loaded <= QUIET_REFRESH_MS)
      assert.equal(new Date(due).getUTCMinutes() % 15, 0)
      assert.equal(new Date(due).getUTCSeconds(), 45)
    }
  })
  it("in the half-hour band the refresh shares the half-hour cron run instead of the quarter", () => {
    const origin = Date.parse("2026-10-24T18:00:00Z")
    for (let offset = 0; offset < 3600_000; offset += 7_919) {
      const loaded = origin + offset
      const due = quietRefreshAt(loaded)
      assert.ok(due > loaded && due - loaded <= 2 * QUIET_REFRESH_MS)
      assert.equal(new Date(due).getUTCMinutes() % 30, 0)
      assert.equal(new Date(due).getUTCSeconds(), 45)
    }
  })
  it("a viewer ends quiet mode immediately even before the scheduled refresh", () => {
    const watched = cache({ watched: true })
    assert.ok(quietRefreshAt(watched.at) > NOW)
    assert.equal(isQuiet(watched, NOW, true, new Set(["a"])), false)
  })
  it("avoids extra Neon awake periods between scheduled jobs during an unwatched game", () => {
    // Three-hour game, 10s upstream ticks, and quarter-hour cron jobs. A SQL operation keeps Neon awake for five minutes.
    // Model the database access plan, not query latency or measured CU consumption. Finals/viewers interrupt quiet mode separately.
    const start = Date.parse("2026-10-23T20:00:45Z")
    const duration = 3 * 3600_000
    const awakeMs = (legacy: boolean) => {
      let loadedAt = start
      let awakeUntil = start + 300_000
      let awake = 0
      const rows = [{ id: "game", startsAt: new Date(start - 60_000) }]
      for (let t = start; t < start + duration; t += 10_000) {
        const cron = new Date(t).getUTCMinutes() % 15 === 0 && new Date(t).getUTCSeconds() < 10
        const quiet = legacy ? t - loadedAt < 12 * 60_000 : isQuiet({ rows, watched: false, at: loadedAt }, t, true, new Set(["game"]))
        if (!quiet) loadedAt = t
        if (cron || !quiet) awakeUntil = t + 300_000
        if (t < awakeUntil) awake += 10_000
      }
      return awake
    }
    assert.ok(awakeMs(false) < awakeMs(true) * 0.75, "aligned refreshes remove at least a quarter of modeled awake time in this isolated workload")
  })
  it("is on for an unwatched slate of started, locked games until the refresh is due", () => {
    assert.equal(isQuiet(cache(), NOW, true, new Set(["a"])), true)
    const loaded = Date.parse("2026-10-23T22:48:00Z")
    const due = Date.parse("2026-10-23T23:00:45Z")
    assert.equal(quietRefreshAt(loaded), due)
    assert.equal(isQuiet(cache({ at: loaded }), due - 1, true, new Set(["a"])), true)
    assert.equal(isQuiet(cache({ at: loaded }), due, true, new Set(["a"])), false)
  })
  it("is off whenever someone is watching, there is nothing on the slate, or nothing could wake the worker", () => {
    assert.equal(isQuiet(cache({ watched: true }), NOW, true, new Set(["a"])), false)
    assert.equal(isQuiet(cache({ rows: [] }), NOW, true, none), false)
    assert.equal(isQuiet(null, NOW, true, none), false)
    assert.equal(isQuiet(cache(), NOW, false, new Set(["a"])), false)
  })
  it("leaves quiet mode for a kickoff whose market has not been locked yet, then returns to it", () => {
    assert.equal(isQuiet(cache(), NOW, true, none), false)
    assert.equal(isQuiet(cache({ rows: [game("soon", -5)] }), NOW, true, none), true)
    assert.equal(isQuiet(cache({ rows: [game("soon", 0)] }), NOW, true, none), false)
    assert.equal(isQuiet(cache({ rows: [game("soon", 0)] }), NOW, true, new Set(["soon"])), true)
  })
})
