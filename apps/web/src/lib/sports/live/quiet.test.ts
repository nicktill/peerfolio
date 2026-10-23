import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isQuiet, QUIET_REFRESH_MS, type QuietCache } from "./plan.ts"

const NOW = Date.parse("2026-10-23T23:00:00Z")
const game = (id: string, startedMinAgo: number) => ({ id, startsAt: new Date(NOW - startedMinAgo * 60_000) })
const cache = (over: Partial<QuietCache> = {}): QuietCache => ({ watched: false, at: NOW - 60_000, rows: [game("a", 30)], ...over })
const none: ReadonlySet<string> = new Set()

describe("quiet mode", () => {
  it("is on for an unwatched slate of started, locked games until the refresh is due", () => {
    assert.equal(isQuiet(cache(), NOW, true, new Set(["a"])), true)
    assert.equal(isQuiet(cache({ at: NOW - QUIET_REFRESH_MS + 1_000 }), NOW, true, new Set(["a"])), true)
    assert.equal(isQuiet(cache({ at: NOW - QUIET_REFRESH_MS }), NOW, true, new Set(["a"])), false)
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
