import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { clockIsZero, clockSaysOver, eventsToTrigger, nextClaim, periodNumber, SettleTriggerTracker, TRIGGER, type SignalInput, type TriggerEvent } from "./settle-trigger.ts"
import { FAST_BURST_SINGLE, FAST_BURST_TWO_SOURCE, FINAL_OBS_GAP_MS, observeFinal, resolveConfigForSport, resolveResult } from "./settlement.ts"
import type { EventResult } from "./types.ts"

const live = (o: Partial<SignalInput> = {}): SignalInput => ({ sport: "nba", status: "live", period: "4", clock: "5:12", homeScore: 100, awayScore: 98, bestMid: 0.8, ...o })

describe("trigger signals", () => {
  it("clock and period parsing", () => {
    for (const c of ["0:00", "00:00", "0.0", "0:00.0", ":00"]) assert.equal(clockIsZero(c), true, c)
    for (const c of ["0:01", "12:00", "", null, "End", "1:00"]) assert.equal(clockIsZero(c as string | null), false, String(c))
    assert.equal(periodNumber("Q4"), 4)
    assert.equal(periodNumber("OT"), 99)
    assert.equal(periodNumber(null), null)
  })
  it("clock-zero only counts in the last period, with a leader", () => {
    assert.equal(clockSaysOver(live({ clock: "0:00" })), true)
    assert.equal(clockSaysOver(live({ clock: "0:00", period: "2" })), false, "halftime")
    assert.equal(clockSaysOver(live({ clock: "0:00", awayScore: 100 })), false, "tied: overtime")
    assert.equal(clockSaysOver(live({ clock: "0:00", sport: "mlb" })), false, "no clock sport")
    assert.equal(clockSaysOver(live({ clock: "0:00", sport: "nhl", period: "3" })), true)
    assert.equal(clockSaysOver(live({ clock: "0:00", sport: "nhl", period: "2" })), false)
  })
})

describe("SettleTriggerTracker", () => {
  const T = 1_000_000
  it("fires at once on a final status, then every retryMs, never overlapping", () => {
    const t = new SettleTriggerTracker()
    assert.equal(t.observe("e", live({ status: "live" }), T).fire, null)
    assert.equal(t.observe("e", live({ status: "final" }), T + 10_000).fire, "status_final")
    assert.equal(t.observe("e", live({ status: "final" }), T + 20_000).fire, null, "in flight")
    t.result("e", false, T + 12_000)
    assert.equal(t.observe("e", live({ status: "final" }), T + 20_000).fire, null, "too soon")
    assert.equal(t.observe("e", live({ status: "final" }), T + 12_000 + TRIGGER.retryMs).fire, "status_final")
  })
  it("stops after done and cools down, and after the poll budget", () => {
    const t = new SettleTriggerTracker()
    t.observe("e", live({ status: "final" }), T)
    t.result("e", true, T + 1000)
    assert.equal(t.observe("e", live({ status: "final" }), T + 60_000).fire, null, "cooldown")
    const u = new SettleTriggerTracker()
    let now = T
    let fired = 0
    for (let i = 0; i < 45; i++) {
      now += TRIGGER.retryMs
      if (u.observe("e", live({ status: "final" }), now).fire) {
        fired++
        u.result("e", false, now)
      }
    }
    assert.equal(fired, TRIGGER.maxPolls.final)
  })
  it("clock at 0:00 fires only after a quiet minute, and a score change restarts the wait", () => {
    const t = new SettleTriggerTracker()
    const z = (o: Partial<SignalInput> = {}) => live({ clock: "0:00", ...o })
    assert.equal(t.observe("e", z(), T).fire, null)
    assert.equal(t.observe("e", z({ homeScore: 102 }), T + 40_000).fire, null, "score moved")
    assert.equal(t.observe("e", z({ homeScore: 102 }), T + 40_000 + TRIGGER.quietMs - 1).fire, null)
    assert.equal(t.observe("e", z({ homeScore: 102 }), T + 40_000 + TRIGGER.quietMs).fire, "clock_zero_quiet")
  })
  it("exchange at 0.99 for a minute fires; a dip resets; pregame never", () => {
    const t = new SettleTriggerTracker()
    assert.equal(t.observe("e", live({ bestMid: 0.995 }), T).fire, null)
    assert.equal(t.observe("e", live({ bestMid: 0.9 }), T + 30_000).fire, null)
    assert.equal(t.observe("e", live({ bestMid: 0.995 }), T + 40_000).fire, null)
    assert.equal(t.observe("e", live({ bestMid: 0.995 }), T + 40_000 + TRIGGER.decidedMs).fire, "exchange_decided")
    const p = new SettleTriggerTracker()
    p.observe("x", live({ status: "pre", bestMid: 0.995 }), T)
    assert.equal(p.observe("x", live({ status: "pre", bestMid: 0.995 }), T + 120_000).fire, null)
  })
  it("a hunch upgrades to a final series once the feed says final", () => {
    const t = new SettleTriggerTracker()
    t.observe("e", live({ bestMid: 0.995 }), T)
    assert.equal(t.observe("e", live({ bestMid: 0.995 }), T + TRIGGER.decidedMs).fire, "exchange_decided")
    t.result("e", false, T + TRIGGER.decidedMs + 1000)
    assert.equal(t.observe("e", live({ status: "final", bestMid: 0.995 }), T + TRIGGER.decidedMs + 2000).fire, "status_final")
  })
  it("prune forgets events that left the slate", () => {
    const t = new SettleTriggerTracker()
    t.observe("a", live(), T)
    t.observe("b", live(), T)
    t.prune(["a"])
    assert.equal(t.size(), 1)
  })
})

describe("shared claim (dedupe across callers)", () => {
  const o = { minGapMs: 15_000, maxPolls: 3 }
  const at = new Date(1_000_000)
  it("first call passes, a call inside the gap is refused, after the gap passes, budget caps", () => {
    assert.deepEqual(nextClaim(null, at, o), { ok: true, polls: 1 })
    assert.deepEqual(nextClaim({ at, polls: 1 }, new Date(at.getTime() + 14_999), o), { ok: false, reason: "too_soon" })
    assert.deepEqual(nextClaim({ at, polls: 1 }, new Date(at.getTime() + 15_000), o), { ok: true, polls: 2 })
    assert.deepEqual(nextClaim({ at, polls: 3 }, new Date(at.getTime() + 60_000), o), { ok: false, reason: "budget_spent" })
  })
  it("the freshly inserted row (epoch, 0 polls) always passes", () => {
    assert.equal(nextClaim({ at: new Date(0), polls: 0 }, at, o).ok, true)
  })
})

describe("scoreboard-driven selection", () => {
  const now = new Date("2026-10-18T20:00:00Z")
  const ev = (o: Partial<TriggerEvent> = {}): TriggerEvent => ({ id: "e1", sport: "nfl", externalId: "401", homeName: "Jacksonville Jaguars", awayName: "Houston Texans", startsAt: new Date("2026-10-18T17:00:00Z"), finalFirstSeenAt: null, ...o })
  const game = { id: "401", sport: "nfl", home: "Jacksonville Jaguars", away: "Houston Texans", startsAt: "2026-10-18T17:00:00Z" }
  it("matches by id, alias or names+time; ignores other sports, the recent-seen limit, future starts", () => {
    assert.deepEqual(eventsToTrigger([ev()], [game], now), ["e1"])
    assert.deepEqual(eventsToTrigger([ev({ externalId: "x" })], [{ ...game, id: "9" }], now), ["e1"], "by names and time")
    assert.deepEqual(eventsToTrigger([ev({ externalId: "x", aliases: { espn: "9" }, homeName: "A" })], [{ ...game, id: "9" }], now), ["e1"], "by alias")
    assert.deepEqual(eventsToTrigger([ev()], [{ ...game, sport: "nba" }], now), [])
    assert.deepEqual(eventsToTrigger([ev({ finalFirstSeenAt: new Date(now.getTime() - 16 * 60_000) })], [game], now), [], "stuck in review: stop")
    assert.deepEqual(eventsToTrigger([ev({ finalFirstSeenAt: new Date(now.getTime() - 5 * 60_000) })], [game], now), ["e1"])
    assert.deepEqual(eventsToTrigger([ev({ startsAt: new Date(now.getTime() + 3600_000) })], [game], now), [])
  })
})

describe("burst stability window", () => {
  const start = new Date("2026-10-18T17:00:00Z")
  const t0 = new Date("2026-10-18T20:00:00Z")
  const at = (s: number) => new Date(t0.getTime() + s * 1000)
  const esp = (): EventResult => ({ source: "espn", externalId: "1", status: "final", homeScore: 27, awayScore: 24, officialFinal: true })
  const base = { minSources: 2, settleDelayMs: 30 * 60_000, postponeGraceMs: 1e12, noResultVoidMs: 1e12, reviewTimeoutMs: 1e12 }
  /** Plays polls at the given offsets (seconds) and returns the resolution kind of the last. */
  function play(sport: "nfl" | "nhl", offsets: number[], results: EventResult[] = [esp()]) {
    const cfg = resolveConfigForSport(base, sport, sport === "nhl" ? 2 : 1)
    let stored = { firstSeen: null as Date | null, firstSeenScore: null as string | null, scoreSeenAt: null as Date | null, obs: 0, lastObsAt: null as Date | null }
    let kind = ""
    for (const s of offsets) {
      const seen = observeFinal(results, stored, at(s))
      stored = seen
      kind = resolveResult(results, { now: at(s), startsAt: start, finalFirstSeenAt: seen.firstSeen, sport, firstSeenScore: seen.firstSeenScore, finalScoreSeenAt: seen.scoreSeenAt, finalObservations: seen.obs, sourcesAnswered: 2 }, cfg).kind
    }
    return kind
  }
  it("single source: 3 polls over 90s settle; fewer polls or a shorter span do not", () => {
    assert.equal(FAST_BURST_SINGLE.minObservations, 3)
    assert.equal(play("nfl", [0, 25, 50, 75]), "wait", "4 polls but only 75s")
    assert.equal(play("nfl", [0, 25, 50, 75, 100]), "final")
    assert.equal(play("nfl", [0, 95]), "wait", "span ok but only 2 polls")
    assert.equal(play("nfl", [0, 50, 95]), "final")
    assert.equal(play("nfl", [0, 3, 6, 95]), "wait", "polls inside the 10s gap count once: 2 observations")
  })
  it("the old two-pass 4 minute rule still settles a slow cron cadence", () => {
    assert.equal(play("nfl", [0, 300]), "final")
    assert.equal(play("nfl", [0, 200]), "wait")
  })
  it("two sources: 2 polls over 45s settle", () => {
    assert.equal(FAST_BURST_TWO_SOURCE.minObservations, 2)
    const nhl = { homeScore: 3, awayScore: 2 }
    const both = [{ ...esp(), ...nhl }, { ...esp(), ...nhl, source: "nhl-api" }]
    assert.equal(play("nhl", [0, 30], both), "wait")
    assert.equal(play("nhl", [0, 46], both), "final")
  })
  it("kill switch turns the burst rule off with the rest", () => {
    process.env.SPORTS_FAST_SETTLE = "0"
    try {
      assert.equal(play("nfl", [0, 25, 50, 75, 100, 120]), "wait")
    } finally {
      delete process.env.SPORTS_FAST_SETTLE
    }
  })
  it("a score that moves after the first read goes to review, whatever the polls say", () => {
    const moved = { ...esp(), homeScore: 28 }
    const cfg = resolveConfigForSport(base, "nfl", 1)
    const r = resolveResult([moved], { now: at(100), startsAt: start, finalFirstSeenAt: t0, sport: "nfl", firstSeenScore: "27-24", finalScoreSeenAt: t0, finalObservations: 5 }, cfg)
    assert.equal(r.kind, "review")
  })
  it("observeFinal: a row with a stored score but no stored time starts its clock on the next pass", () => {
    const o = observeFinal([esp()], { firstSeen: t0, firstSeenScore: "27-24", scoreSeenAt: null }, at(60))
    assert.equal(o.scoreSeenAt!.getTime(), at(60).getTime())
    assert.equal(o.changed, true)
    assert.ok(FINAL_OBS_GAP_MS > 0)
  })
})
