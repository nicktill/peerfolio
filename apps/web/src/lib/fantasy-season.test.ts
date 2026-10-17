import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildRecap,
  checkPicks,
  cleanNote,
  dateKey,
  draftDeadline,
  draftScore,
  extremeDecisions,
  hasFinalSnapshot,
  headToHead,
  nextSeasonStart,
  nextWeekStart,
  overtakes,
  percentChange,
  pickReturnPct,
  picksOpen,
  rankRound,
  roundEndValue,
  roundNumberAt,
  roundStartValue,
  roundTrophies,
  roundWindow,
  seasonEnd,
  seasonStandings,
  seasonTrophies,
  settleDecision,
  SETTLE_GRACE_MS,
  weekStart,
  type RoundResult,
} from "./fantasy-season.ts"

const at = (iso: string) => new Date(iso)

describe("calendar", () => {
  it("snaps any moment to Monday 00:00 UTC of its week", () => {
    assert.equal(weekStart(at("2026-10-14T13:45:00Z")).toISOString(), "2026-10-12T00:00:00.000Z") // Wednesday
    assert.equal(weekStart(at("2026-10-12T00:00:00Z")).toISOString(), "2026-10-12T00:00:00.000Z") // Monday exactly
    assert.equal(weekStart(at("2026-10-18T23:59:59Z")).toISOString(), "2026-10-12T00:00:00.000Z") // Sunday night
  })

  it("finds the next Monday strictly after a moment", () => {
    assert.equal(nextWeekStart(at("2026-10-12T00:00:00Z")).toISOString(), "2026-10-19T00:00:00.000Z")
    assert.equal(nextWeekStart(at("2026-10-18T23:00:00Z")).toISOString(), "2026-10-19T00:00:00.000Z")
  })

  it("crosses month and year boundaries", () => {
    assert.equal(weekStart(at("2027-01-01T10:00:00Z")).toISOString(), "2026-12-28T00:00:00.000Z")
    assert.equal(nextWeekStart(at("2026-12-30T10:00:00Z")).toISOString(), "2027-01-04T00:00:00.000Z")
  })

  it("lays rounds end to end with no gap or overlap", () => {
    const start = at("2026-10-12T00:00:00Z")
    const one = roundWindow(start, 1)
    const two = roundWindow(start, 2)
    assert.equal(one.startsAt.toISOString(), start.toISOString())
    assert.equal(one.endsAt.getTime(), two.startsAt.getTime())
    assert.equal(roundWindow(start, 4).endsAt.toISOString(), "2026-11-09T00:00:00.000Z")
  })

  it("numbers the round in progress, holding at the last round of a fixed season", () => {
    const start = at("2026-10-12T00:00:00Z")
    assert.equal(roundNumberAt(start, at("2026-10-11T23:59:59Z"), 4), 0)
    assert.equal(roundNumberAt(start, at("2026-10-12T00:00:00Z"), 4), 1)
    assert.equal(roundNumberAt(start, at("2026-10-18T23:59:59Z"), 4), 1)
    assert.equal(roundNumberAt(start, at("2026-10-19T00:00:00Z"), 4), 2)
    assert.equal(roundNumberAt(start, at("2027-03-01T00:00:00Z"), 4), 4)
    assert.equal(roundNumberAt(start, at("2027-03-01T00:00:00Z"), null), 21)
  })

  it("reports when a fixed season ends, and null for an open one", () => {
    const start = at("2026-10-12T00:00:00Z")
    assert.equal(seasonEnd(start, 4)?.toISOString(), "2026-11-09T00:00:00.000Z")
    assert.equal(seasonEnd(start, null), null)
  })

  it("starts a rematch next Monday, but gives a draft a full lead", () => {
    // Sunday 20:00 UTC: Monday is 4 hours away.
    assert.equal(nextSeasonStart(at("2026-10-18T20:00:00Z"), "trading").toISOString(), "2026-10-19T00:00:00.000Z")
    assert.equal(nextSeasonStart(at("2026-10-18T20:00:00Z"), "draft").toISOString(), "2026-10-26T00:00:00.000Z")
    assert.equal(nextSeasonStart(at("2026-10-14T20:00:00Z"), "draft").toISOString(), "2026-10-19T00:00:00.000Z")
  })
})

describe("deadline locking", () => {
  const roundStart = at("2026-10-19T00:00:00Z")
  const deadline = draftDeadline(roundStart)

  it("locks at the moment the round starts", () => {
    assert.equal(deadline.getTime(), roundStart.getTime())
  })

  it("accepts picks up to the last millisecond, and none from the deadline on", () => {
    assert.equal(picksOpen(deadline, at("2026-10-18T23:59:59.999Z")), true)
    assert.equal(picksOpen(deadline, at("2026-10-19T00:00:00.000Z")), false)
    assert.equal(picksOpen(deadline, at("2026-10-19T09:00:00Z")), false)
  })

  it("waits for the end of a round, then for its data, then gives up on the data after the grace period", () => {
    const end = at("2026-10-19T00:00:00Z")
    assert.equal(settleDecision(end, at("2026-10-18T23:00:00Z"), true), "wait")
    assert.equal(settleDecision(end, at("2026-10-19T00:00:00Z"), true), "settle")
    assert.equal(settleDecision(end, at("2026-10-19T06:00:00Z"), false), "wait")
    assert.equal(settleDecision(end, new Date(end.getTime() + SETTLE_GRACE_MS), false), "settle-late")
  })
})

describe("trading round values", () => {
  const history = [
    { date: "2026-10-09", value: 100_000 }, // Friday before
    { date: "2026-10-11", value: 101_000 }, // Sunday before
    { date: "2026-10-12", value: 102_000 }, // Monday
    { date: "2026-10-16", value: 106_000 }, // Friday
    { date: "2026-10-18", value: 106_500 }, // Sunday
    { date: "2026-10-19", value: 110_000 }, // next Monday: after the round
  ]
  const start = at("2026-10-12T00:00:00Z")
  const end = at("2026-10-19T00:00:00Z")

  it("starts from the last snapshot before the round", () => {
    assert.equal(roundStartValue(history, at("2026-09-01T00:00:00Z"), 100_000, start), 101_000)
  })

  it("ends at the last snapshot dated before the end day, ignoring anything after", () => {
    assert.equal(roundEndValue(history, end, 0), 106_500)
  })

  it("starts a mid-round joiner from starting cash, not from a snapshot", () => {
    assert.equal(roundStartValue(history, at("2026-10-14T10:00:00Z"), 50_000, start), 50_000)
  })

  it("falls back to starting cash for a member with no earlier snapshot", () => {
    assert.equal(roundStartValue([], at("2026-10-01T00:00:00Z"), 100_000, start), 100_000)
  })

  it("falls back to the live value when no snapshot is in yet", () => {
    assert.equal(roundEndValue([], end, 123), 123)
  })

  it("knows when the round's last-day snapshot has landed", () => {
    assert.equal(hasFinalSnapshot(history.slice(0, 4), end), false)
    assert.equal(hasFinalSnapshot(history.slice(0, 5), end), true)
  })

  it("computes a percentage change and survives a zero base", () => {
    assert.equal(percentChange(100, 110), 10)
    assert.equal(percentChange(0, 110), 0)
    assert.equal(dateKey(at("2026-10-19T00:00:00Z")), "2026-10-19")
  })
})

describe("draft scoring", () => {
  it("returns a pick's percentage and null when a price is missing", () => {
    assert.equal(pickReturnPct({ entry: 100, exit: 110 }), 10)
    assert.equal(pickReturnPct({ entry: null, exit: 110 }), null)
    assert.equal(pickReturnPct({ entry: 100, exit: 0 }), null)
  })

  it("averages the picks equally across all slots", () => {
    const score = draftScore([{ entry: 100, exit: 120 }, { entry: 50, exit: 45 }, { entry: 10, exit: 10 }], 3)
    assert.ok(Math.abs(score.percent - 10 / 3) < 1e-9)
    assert.equal(score.floor, -10)
    assert.equal(score.priced, 3)
  })

  it("counts empty slots as cash, so two picks of five dilute the score", () => {
    const score = draftScore([{ entry: 100, exit: 110 }, { entry: 100, exit: 110 }], 5)
    assert.equal(score.percent, 4)
    assert.equal(score.floor, 0)
  })

  it("counts an unpriced pick as cash", () => {
    const score = draftScore([{ entry: null, exit: null }, { entry: 100, exit: 110 }], 2)
    assert.equal(score.percent, 5)
    assert.equal(score.priced, 1)
  })

  it("ignores picks beyond the slot count", () => {
    const score = draftScore([{ entry: 1, exit: 2 }, { entry: 1, exit: 3 }], 1)
    assert.equal(score.percent, 100)
  })

  it("validates a pick list", () => {
    assert.deepEqual(checkPicks([" nvda ", "aapl"], 5), { ok: true, tickers: ["NVDA", "AAPL"] })
    assert.equal(checkPicks([], 5).ok, false)
    assert.equal(checkPicks(["A", "B", "C"], 2).ok, false)
    assert.equal(checkPicks(["NVDA", "nvda"], 5).ok, false)
    assert.deepEqual(checkPicks(["", "AAPL"], 5), { ok: true, tickers: ["AAPL"] })
  })
})

describe("ranking, ties and points", () => {
  it("ranks by return and awards field size minus position plus one", () => {
    const r = rankRound([
      { key: "a", percent: 1 },
      { key: "b", percent: 5 },
      { key: "c", percent: -2 },
    ])
    assert.deepEqual(r.map((x) => [x.key, x.rank, x.points]), [["b", 1, 3], ["a", 2, 2], ["c", 3, 1]])
  })

  it("splits points between a tie for first", () => {
    const r = rankRound([
      { key: "a", percent: 4 },
      { key: "b", percent: 4 },
      { key: "c", percent: 1 },
      { key: "d", percent: 0 },
    ])
    assert.deepEqual(r.map((x) => [x.key, x.rank, x.points]), [["a", 1, 3.5], ["b", 1, 3.5], ["c", 3, 2], ["d", 4, 1]])
    assert.equal(r.reduce((s, x) => s + x.points, 0), 10) // points are conserved
  })

  it("treats returns that match to two decimals as a tie", () => {
    const r = rankRound([{ key: "a", percent: 2.0041 }, { key: "b", percent: 2.0049 }])
    assert.deepEqual(r.map((x) => x.rank), [1, 1])
  })

  it("breaks an exact return tie by the better worst pick", () => {
    const r = rankRound([
      { key: "reckless", percent: 3, floor: -20 },
      { key: "steady", percent: 3, floor: -1 },
    ])
    assert.deepEqual(r.map((x) => [x.key, x.rank]), [["steady", 1], ["reckless", 2]])
  })

  it("still shares a rank when return and worst pick both match", () => {
    const r = rankRound([{ key: "a", percent: 3, floor: -1 }, { key: "b", percent: 3, floor: -1 }])
    assert.deepEqual(r.map((x) => [x.rank, x.points]), [[1, 1.5], [1, 1.5]])
  })

  it("is stable regardless of input order", () => {
    const entries = [{ key: "a", percent: 2 }, { key: "b", percent: 9 }, { key: "c", percent: 2 }]
    const forward = rankRound(entries).map((x) => [x.key, x.rank])
    const backward = rankRound([...entries].reverse()).map((x) => [x.key, x.rank])
    assert.deepEqual(forward.map((x) => x[1]), backward.map((x) => x[1]))
  })

  it("handles a field of one and an empty field", () => {
    assert.deepEqual(rankRound([{ key: "a", percent: 1 }]).map((x) => [x.rank, x.points]), [[1, 1]])
    assert.deepEqual(rankRound([]), [])
  })
})

const result = (roundNumber: number, userId: string, percent: number, rank: number, points: number): RoundResult => ({ roundNumber, userId, percent, rank, points })

describe("season standings", () => {
  it("adds up points and orders by them", () => {
    const rows = seasonStandings([
      result(1, "a", 5, 1, 3), result(1, "b", 2, 2, 2), result(1, "c", -1, 3, 1),
      result(2, "a", -3, 3, 1), result(2, "b", 4, 1, 3), result(2, "c", 0, 2, 2),
    ])
    assert.deepEqual(rows.map((r) => [r.userId, r.points, r.rank]), [["b", 5, 1], ["a", 4, 2], ["c", 3, 3]])
  })

  it("breaks a points tie by compounded return", () => {
    const rows = seasonStandings([
      result(1, "a", 10, 1, 2), result(1, "b", 1, 2, 1),
      result(2, "a", -5, 2, 1), result(2, "b", 3, 1, 2),
    ])
    // Both 3 points. a: 1.10 * 0.95 = +4.5%. b: 1.01 * 1.03 = +4.03%.
    assert.deepEqual(rows.map((r) => [r.userId, r.rank]), [["a", 1], ["b", 2]])
    assert.ok(Math.abs(rows[0]!.compounded - 4.5) < 1e-9)
  })

  it("then by round wins, and shares the rank when everything is level", () => {
    const rows = seasonStandings([result(1, "a", 2, 1, 1.5), result(1, "b", 2, 1, 1.5)])
    assert.deepEqual(rows.map((r) => r.rank), [1, 1])
  })

  it("counts wins and rounds played", () => {
    const rows = seasonStandings([result(1, "a", 2, 1, 2), result(2, "a", 2, 1, 2), result(1, "b", 1, 2, 1)])
    const a = rows.find((r) => r.userId === "a")!
    assert.equal(a.wins, 2)
    assert.equal(a.rounds, 2)
    assert.equal(rows.find((r) => r.userId === "b")!.rounds, 1)
  })

  it("returns nothing for no results", () => {
    assert.deepEqual(seasonStandings([]), [])
  })
})

describe("head to head", () => {
  it("records wins, losses and ties from each round both played", () => {
    const h2h = headToHead([
      result(1, "a", 5, 1, 3), result(1, "b", 2, 2, 2), result(1, "c", 1, 3, 1),
      result(2, "a", 1, 2, 2), result(2, "b", 4, 1, 3),
      result(3, "a", 2, 1, 1.5), result(3, "b", 2, 1, 1.5),
    ])
    assert.deepEqual(h2h.get("a")!.get("b"), { wins: 1, losses: 1, ties: 1 })
    assert.deepEqual(h2h.get("b")!.get("a"), { wins: 1, losses: 1, ties: 1 })
    assert.deepEqual(h2h.get("a")!.get("c"), { wins: 1, losses: 0, ties: 0 })
    assert.equal(h2h.get("c")!.get("b")!.losses, 1)
    assert.equal(h2h.get("b")!.get("c")!.wins, 1)
  })

  it("is symmetric: one player's wins are the other's losses", () => {
    const h2h = headToHead([result(1, "a", 5, 1, 2), result(1, "b", 2, 2, 1), result(2, "a", 1, 2, 1), result(2, "b", 4, 1, 2), result(3, "a", 3, 1, 2), result(3, "b", 0, 2, 1)])
    const ab = h2h.get("a")!.get("b")!
    const ba = h2h.get("b")!.get("a")!
    assert.deepEqual([ab.wins, ab.losses, ab.ties], [ba.losses, ba.wins, ba.ties])
  })
})

describe("trophies", () => {
  it("gives the round winner a trophy, and shared winners one each", () => {
    const t = roundTrophies(1, [result(1, "a", 2, 1, 1.5), result(1, "b", 2, 1, 1.5), result(1, "c", 0, 3, 1)], [])
    assert.deepEqual(t.map((x) => [x.userId, x.kind]), [["a", "round_win"], ["b", "round_win"]])
  })

  it("gives nothing when everyone shares first (three players all at 0%)", () => {
    const t = roundTrophies(1, [result(1, "a", 0, 1, 2), result(1, "b", 0, 1, 2), result(1, "c", 0, 1, 2)], [])
    assert.deepEqual(t, [])
  })

  it("still gives a trophy to a two-way tie for first in a field of three", () => {
    const t = roundTrophies(1, [result(1, "a", 2, 1, 2.5), result(1, "b", 2, 1, 2.5), result(1, "c", 0, 3, 1)], [])
    assert.equal(t.length, 2)
  })

  it("does not award a hat trick in a two-player league", () => {
    const earlier = [result(1, "a", 3, 1, 2), result(1, "b", 1, 2, 1), result(2, "a", 3, 1, 2), result(2, "b", 1, 2, 1)]
    assert.ok(!roundTrophies(3, [result(3, "a", 3, 1, 2), result(3, "b", 1, 2, 1)], earlier).some((x) => x.kind === "hat_trick"))
  })

  it("gives nothing in a field of one", () => {
    assert.deepEqual(roundTrophies(1, [result(1, "a", 2, 1, 1)], []), [])
  })

  it("awards a hat trick on the third straight win, and not when the streak was broken", () => {
    const earlier = [result(1, "a", 3, 1, 3), result(1, "b", 1, 2, 2), result(1, "c", 0, 3, 1), result(2, "a", 3, 1, 3), result(2, "b", 1, 2, 2), result(2, "c", 0, 3, 1)]
    const now = [result(3, "a", 3, 1, 3), result(3, "b", 1, 2, 2), result(3, "c", 0, 3, 1)]
    assert.ok(roundTrophies(3, now, earlier).some((t) => t.userId === "a" && t.kind === "hat_trick"))
    const broken = [result(1, "a", 3, 1, 3), result(1, "b", 1, 2, 2), result(1, "c", 0, 3, 1), result(2, "a", 0, 3, 1), result(2, "b", 3, 1, 3), result(2, "c", 1, 2, 2)]
    assert.ok(!roundTrophies(3, now, broken).some((t) => t.kind === "hat_trick"))
  })

  it("awards season podium places only when the field is big enough", () => {
    const rows = (n: number) => seasonStandings(Array.from({ length: n }, (_, i) => result(1, `p${i}`, 10 - i, i + 1, n - i)))
    assert.deepEqual(seasonTrophies(rows(2), 1).map((t) => t.kind), ["season_champion"])
    assert.deepEqual(seasonTrophies(rows(3), 1).map((t) => t.kind), ["season_champion", "season_runner_up"])
    assert.deepEqual(seasonTrophies(rows(4), 1).map((t) => t.kind), ["season_champion", "season_runner_up", "season_third"])
    assert.deepEqual(seasonTrophies(rows(1), 1), [])
  })

  it("awards a perfect season for winning every round of three or more", () => {
    const sweep = seasonStandings([1, 2, 3].flatMap((n) => [result(n, "a", 3, 1, 2), result(n, "b", 1, 2, 1)]))
    assert.ok(seasonTrophies(sweep, 3).some((t) => t.userId === "a" && t.kind === "perfect_season"))
    assert.ok(!seasonTrophies(sweep, 4).some((t) => t.kind === "perfect_season"))
    const short = seasonStandings([1, 2].flatMap((n) => [result(n, "a", 3, 1, 2), result(n, "b", 1, 2, 1)]))
    assert.ok(!seasonTrophies(short, 2).some((t) => t.kind === "perfect_season"))
  })
})

describe("recap", () => {
  const people = new Map([
    ["a", { userId: "a", name: "Maya", handle: "maya" }],
    ["b", { userId: "b", name: "Josh", handle: "josh" }],
    ["c", { userId: "c", name: "Priya", handle: null }],
  ])

  it("finds who passed whom in the season table", () => {
    const moves = overtakes(
      [{ userId: "a", rank: 1 }, { userId: "b", rank: 2 }, { userId: "c", rank: 3 }],
      [{ userId: "b", rank: 1 }, { userId: "c", rank: 2 }, { userId: "a", rank: 3 }],
    )
    assert.deepEqual(moves, [{ who: "b", passed: "a" }, { who: "c", passed: "a" }])
  })

  it("reports no overtakes in the first round, when there is no table before it", () => {
    assert.deepEqual(overtakes([], [{ userId: "a", rank: 1 }, { userId: "b", rank: 2 }]), [])
  })

  it("picks the best and worst decision, and omits a 'worst' that was still a gain", () => {
    const d = [
      { userId: "a", ticker: "NVDA", percent: 8, kind: "pick" as const },
      { userId: "b", ticker: "GME", percent: -6, kind: "pick" as const },
    ]
    assert.equal(extremeDecisions(d).best?.ticker, "NVDA")
    assert.equal(extremeDecisions(d).worst?.ticker, "GME")
    assert.equal(extremeDecisions([{ userId: "a", ticker: "X", percent: 2, kind: "trade" }]).worst, null)
    assert.deepEqual(extremeDecisions([]), { best: null, worst: null })
  })

  it("builds a percentage-only recap with a headline, winner, loser and overtakes", () => {
    const results = [
      { userId: "a", percent: 1.2, rank: 2, points: 2 },
      { userId: "b", percent: 4.5, rank: 1, points: 3 },
      { userId: "c", percent: -2.1, rank: 3, points: 1 },
    ]
    const recap = buildRecap({
      roundNumber: 2,
      mode: "draft",
      people,
      results,
      before: [{ userId: "a", rank: 1 }, { userId: "b", rank: 2 }, { userId: "c", rank: 3 }],
      after: seasonStandings([
        { roundNumber: 1, userId: "a", percent: 5, rank: 1, points: 3 }, { roundNumber: 1, userId: "b", percent: 2, rank: 2, points: 2 }, { roundNumber: 1, userId: "c", percent: 0, rank: 3, points: 1 },
        { roundNumber: 2, userId: "a", percent: 1.2, rank: 2, points: 2 }, { roundNumber: 2, userId: "b", percent: 4.5, rank: 1, points: 3 }, { roundNumber: 2, userId: "c", percent: -2.1, rank: 3, points: 1 },
      ]),
      decisions: [{ userId: "b", ticker: "NVDA", percent: 12, kind: "pick" }, { userId: "c", ticker: "GME", percent: -9, kind: "pick" }],
      seasonRounds: 4,
    })
    assert.equal(recap.headline, "Josh takes Round 2 with +4.50%")
    assert.equal(recap.winners[0]!.name, "Josh")
    assert.equal(recap.loser?.name, "Priya")
    assert.equal(recap.bestDecision?.ticker, "NVDA")
    assert.equal(recap.worstDecision?.ticker, "GME")
    assert.deepEqual(recap.overtakes.map((o) => [o.who.name, o.passed.name]), [["Josh", "Maya"]])
    assert.equal(recap.leader?.name, "Josh")
    // Percentages and names only.
    const json = JSON.stringify(recap)
    assert.ok(!/balance|cash|shares|value|\$/i.test(json.replace(/"leader"|"points"/g, "")))
  })

  it("does not name a loser when everyone tied", () => {
    const recap = buildRecap({
      roundNumber: 1, mode: "trading", people,
      results: [{ userId: "a", percent: 1, rank: 1, points: 1.5 }, { userId: "b", percent: 1, rank: 1, points: 1.5 }],
      before: [], after: [], decisions: [], seasonRounds: null,
    })
    assert.equal(recap.loser, null)
    assert.match(recap.headline, /share Round 1/)
  })
})

describe("notes", () => {
  it("trims, collapses whitespace and caps the length", () => {
    assert.equal(cleanNote("  big   earnings \n beat  "), "big earnings beat")
    assert.equal(cleanNote("x".repeat(500))?.length, 280)
  })
  it("returns null for empty or non-text input", () => {
    assert.equal(cleanNote("   "), null)
    assert.equal(cleanNote(42), null)
    assert.equal(cleanNote(undefined), null)
  })
})
