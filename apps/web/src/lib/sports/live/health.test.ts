import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { clip, logLine, emit } from "../log.ts"
import { kickoffGateDecided } from "../picks.ts"
import { cycleFailed, liveHealth, shouldExit, EXIT_AFTER_FAILURES, type HealthGame, type HealthInput } from "./health.ts"

const NOW = new Date("2026-10-18T20:00:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const game = (over: Partial<HealthGame> = {}): HealthGame => ({ eventId: "g1", label: "DET @ BOS", sport: "nba", newestQuoteAt: ago(4_000), newestStateAt: ago(4_000), ...over })
const worker = (over: Partial<NonNullable<HealthInput["worker"]>> = {}) => ({ lastCycleAt: ago(5_000), lastOkAt: ago(5_000), consecutiveFailures: 0, details: {}, ...over })

describe("live health classification", () => {
  it("ok when live games are fresh and the worker is beating", () => {
    const h = liveHealth({ worker: worker(), liveGames: [game()] }, NOW)
    assert.equal(h.status, "ok")
    assert.equal(h.httpStatus, 200)
    assert.equal(h.games[0]!.quoteAgeMs, 4_000)
    assert.equal(h.games[0]!.fresh, true)
  })
  it("down (503) when games are live and the worker is silent", () => {
    const h = liveHealth({ worker: worker({ lastCycleAt: ago(5 * 60_000) }), liveGames: [game()] }, NOW)
    assert.equal(h.status, "down")
    assert.equal(h.httpStatus, 503)
  })
  it("down when no live game has a fresh quote, degraded when only some lack one", () => {
    const stale = game({ newestQuoteAt: ago(5 * 60_000) })
    assert.equal(liveHealth({ worker: worker(), liveGames: [stale] }, NOW).status, "down")
    assert.equal(liveHealth({ worker: worker(), liveGames: [stale, game({ eventId: "g2" })] }, NOW).status, "degraded")
    assert.equal(liveHealth({ worker: worker(), liveGames: [game({ newestQuoteAt: null })] }, NOW).status, "down")
  })
  it("degraded for unmatched games, with the reason from the worker", () => {
    const h = liveHealth({ worker: worker({ details: { unmatched: [{ eventId: "g2", reason: "no_name_match" }] } }), liveGames: [game(), game({ eventId: "g2", label: "X @ Y" })] }, NOW)
    assert.equal(h.status, "degraded")
    assert.deepEqual(h.unmatched, [{ eventId: "g2", label: "X @ Y", reason: "no_name_match" }])
  })
  it("failure streaks degrade then take it down", () => {
    assert.equal(liveHealth({ worker: worker({ consecutiveFailures: 3 }), liveGames: [game()] }, NOW).status, "degraded")
    assert.equal(liveHealth({ worker: worker({ consecutiveFailures: 6 }), liveGames: [game()] }, NOW).status, "down")
  })
  it("an idle worker that is sleeping on purpose is ok; one that is overdue is only degraded (nothing live yet)", () => {
    const sleeping = worker({ lastCycleAt: ago(10 * 60_000), details: { sleepUntil: new Date(NOW.getTime() + 5 * 60_000).toISOString() } })
    assert.equal(liveHealth({ worker: sleeping, liveGames: [] }, NOW).status, "ok")
    const overdue = worker({ lastCycleAt: ago(30 * 60_000), details: { sleepUntil: ago(10 * 60_000).toISOString() } })
    assert.equal(liveHealth({ worker: overdue, liveGames: [] }, NOW).status, "degraded")
    assert.equal(liveHealth({ worker: null, liveGames: [] }, NOW).status, "degraded")
  })
  it("games on the field need a beating worker even if it said it would sleep", () => {
    const asleep = worker({ lastCycleAt: ago(10 * 60_000), details: { sleepUntil: new Date(NOW.getTime() + 5 * 60_000).toISOString() } })
    assert.equal(liveHealth({ worker: asleep, liveGames: [game()] }, NOW).status, "down")
  })
})

describe("worker failure and exit rules", () => {
  it("a throw, or live games where every attempted upstream call failed, is a total failure", () => {
    const base = { threw: false, slate: 2, okCalls: 0, failCalls: 0, skippedBackoff: 0 }
    assert.equal(cycleFailed({ ...base, threw: true }), true)
    assert.equal(cycleFailed({ ...base, failCalls: 1 }), true)
    assert.equal(cycleFailed({ ...base, skippedBackoff: 2 }), true)
    assert.equal(cycleFailed({ ...base, okCalls: 1, failCalls: 1 }), false)
    assert.equal(cycleFailed({ ...base, slate: 0, failCalls: 1 }), false) // nothing live: not a failure
    assert.equal(cycleFailed(base), false) // live games with nothing to call (a sport with no exchange series)
  })
  it("exits after repeated total failures", () => {
    assert.equal(shouldExit(EXIT_AFTER_FAILURES - 1), false)
    assert.equal(shouldExit(EXIT_AFTER_FAILURES), true)
  })
})

describe("structured logs", () => {
  it("one JSON line with level, event name and time", () => {
    const line = logLine("warn", "live.cycle", { games: 2 }, NOW)
    assert.deepEqual(JSON.parse(line), { at: NOW.toISOString(), level: "warn", ev: "live.cycle", games: 2 })
    assert.ok(!line.includes("\n"))
  })
  it("clips long text and errors", () => {
    assert.equal(clip("x".repeat(1000)).length < 330, true)
    assert.match(clip(new Error("boom")), /boom/)
    assert.equal(clip({ a: 1 }), '{"a":1}')
  })
  it("emit goes to the sink with the level", () => {
    const seen: [string, string][] = []
    emit("error", "x", {}, (l, line) => void seen.push([l, line]), NOW)
    assert.equal(seen[0]![0], "error")
  })
})

describe("kickoff gate attribution", () => {
  const ctx = (nowMs: number, over: Record<string, unknown> = {}) => ({
    now: new Date(NOW.getTime() + nowMs),
    market: { id: "m", status: "open", lockAt: new Date(NOW.getTime() + 3600_000) },
    eventStatus: "scheduled",
    eventStartsAt: NOW,
    ...over,
  })
  it("is the deciding check only when the lock has not passed but kickoff has", () => {
    assert.equal(kickoffGateDecided(ctx(1)), true)
    assert.equal(kickoffGateDecided(ctx(-1)), false)
    assert.equal(kickoffGateDecided(ctx(2 * 3600_000)), false) // lock passed first
    assert.equal(kickoffGateDecided(ctx(1, { eventStatus: "postponed" })), false)
  })
})
