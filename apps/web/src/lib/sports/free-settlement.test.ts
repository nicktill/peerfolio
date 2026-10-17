import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { EspnResultsProvider } from "./providers/espn.ts"
import { familiesFor, resolveConfigFor, sportsWithoutQuorum } from "./providers/index.ts"
import { MlbResultsProvider } from "./providers/mlb-statsapi.ts"
import { NhlResultsProvider } from "./providers/nhl-api.ts"
import { FREE_RESULT_FAMILIES, gradePick, observeFinal, resolveConfigForSport, resolveResult, resultsForEvent, scoreProblem, SINGLE_SOURCE_SETTLE_DELAY_MS, DEFAULT_RESOLVE, type Resolution } from "./settlement.ts"
import { SPORTS, type EventResult, type Outcome, type ResultsProvider, type Selection, type Sport } from "./types.ts"

/** The exchange-mode (free) provider set, built the same way the cron builds it. */
const providers: ResultsProvider[] = [new EspnResultsProvider(), new NhlResultsProvider(), new MlbResultsProvider()]
const cfgFor = resolveConfigFor(providers)
const MIN = 60_000
const HOUR = 3600_000

const SAVED = process.env.SPORTS_MIN_RESULT_SOURCES
afterEach(() => {
  if (SAVED === undefined) delete process.env.SPORTS_MIN_RESULT_SOURCES
  else process.env.SPORTS_MIN_RESULT_SOURCES = SAVED
})

type Ev = { externalId: string; homeName: string; awayName: string; startsAt: Date }
type Stored = { firstSeen: Date | null; firstSeenScore: string | null }
const res = (family: string, over: Partial<EventResult>): EventResult => ({
  source: family,
  family,
  externalId: `${family}-1`,
  homeName: "Home FC",
  awayName: "Away FC",
  startsAt: new Date("2026-10-17T20:00:00Z"),
  status: "final",
  homeScore: 2,
  awayScore: 1,
  ...over,
})
const ev: Ev = { externalId: "espn-1", homeName: "Home FC", awayName: "Away FC", startsAt: new Date("2026-10-17T20:00:00Z") }
const at = (ms: number) => new Date(ev.startsAt.getTime() + ms)

/** One settle run for one event, exactly the per-event steps the store takes. Returns the resolution and the updated memory. */
function run(sport: Sport, all: EventResult[], stored: Stored, now: Date): { r: Resolution; stored: Stored } {
  const { results } = resultsForEvent(ev, all)
  const seen = observeFinal(results, stored, now)
  const r = resolveResult(results, { now, startsAt: ev.startsAt, finalFirstSeenAt: seen.firstSeen, sourcesAnswered: 1, sport, firstSeenScore: seen.firstSeenScore }, cfgFor(sport))
  return { r, stored: { firstSeen: seen.firstSeen, firstSeenScore: seen.firstSeenScore } }
}
const fresh: Stored = { firstSeen: null, firstSeenScore: null }
const gradeAll = (sport: Sport, r: Resolution, selection: Selection): Outcome =>
  r.kind === "void" ? "void" : r.kind === "final" ? gradePick({ sport, kind: "moneyline", selection, point: null, player: null, statKey: null }, r.result) : (assert.fail(`not settled: ${r.kind}`), "void")

/** Drive an ESPN-only sport to its settlement: first sighting waits, a re-sight after the delay settles. */
function settleEspnOnly(sport: Sport, h: number, a: number) {
  const final = [res("espn", { homeScore: h, awayScore: a })]
  const first = run(sport, final, fresh, at(3 * HOUR))
  assert.deepEqual([first.r.kind, (first.r as { reason?: string }).reason], ["wait", "settle delay"])
  const early = run(sport, final, first.stored, at(3 * HOUR + 10 * MIN))
  assert.equal(early.r.kind, "wait", "seen again, but not far enough apart")
  return run(sport, final, first.stored, at(3 * HOUR + SINGLE_SOURCE_SETTLE_DELAY_MS + 6 * HOUR)).r
}

describe("per-sport quorum", () => {
  it("two free families for NHL and MLB, one (ESPN) for the rest", () => {
    assert.equal(cfgFor("nhl").minSources, 2)
    assert.equal(cfgFor("mlb").minSources, 2)
    for (const s of ["nfl", "nba", "cfb", "mls", "tennis"] as const) assert.equal(cfgFor(s).minSources, 1, s)
    assert.deepEqual(Object.keys(FREE_RESULT_FAMILIES).sort(), [...SPORTS].sort())
    assert.equal(familiesFor(providers, "nhl"), 2)
    assert.equal(familiesFor(providers, "nfl"), 1)
  })
  it("single-source sports get at least the stricter settle delay", () => {
    for (const s of ["nfl", "nba", "cfb", "mls", "tennis"] as const) assert.ok(cfgFor(s).settleDelayMs >= SINGLE_SOURCE_SETTLE_DELAY_MS, s)
    assert.equal(resolveConfigForSport({ ...DEFAULT_RESOLVE, settleDelayMs: 0 }, "nba", 1).settleDelayMs, SINGLE_SOURCE_SETTLE_DELAY_MS)
  })
  it("never asks for more families than are switched on: NHL with its own feed off falls back to the single-source net", () => {
    const espnOnly = [new EspnResultsProvider()]
    const c = resolveConfigFor(espnOnly)("nhl")
    assert.equal(c.minSources, 1)
    assert.ok(c.settleDelayMs >= SINGLE_SOURCE_SETTLE_DELAY_MS)
  })
  it("SPORTS_MIN_RESULT_SOURCES still overrides every sport", () => {
    process.env.SPORTS_MIN_RESULT_SOURCES = "2"
    assert.equal(resolveConfigFor(providers)("nba").minSources, 2)
    assert.deepEqual(sportsWithoutQuorum(providers, SPORTS).sort(), ["nba", "nfl", "cfb", "mls", "tennis"].sort(), "ESPN-only sports cannot meet an override of 2")
    process.env.SPORTS_MIN_RESULT_SOURCES = "1"
    assert.equal(resolveConfigFor(providers)("nhl").minSources, 1)
  })
  it("the settle route default configuration has quorum for every sport (no 503)", () => {
    delete process.env.SPORTS_MIN_RESULT_SOURCES
    assert.deepEqual(sportsWithoutQuorum(providers, SPORTS), [])
    assert.deepEqual(sportsWithoutQuorum([], SPORTS).length, SPORTS.length)
  })
  it("the settle route only fails when nothing can settle at all", () => {
    const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/api/cron/sports/settle/route.ts"), "utf8")
    assert.ok(code.includes("short.length === SPORTS.length"))
    assert.ok(!code.includes("families < config.minSources"))
  })
})

describe("end to end on ESPN alone (exchange mode)", () => {
  it("MLS: a drawn match settles and the draw side wins", () => {
    const r = settleEspnOnly("mls", 1, 1)
    assert.equal(r.kind, "final")
    assert.equal(gradeAll("mls", r, "draw"), "win")
    assert.equal(gradeAll("mls", r, "home"), "loss")
    assert.equal(gradeAll("mls", r, "away"), "loss")
  })
  it("NFL and CFB: a tie settles as a push on either side", () => {
    for (const sport of ["nfl", "cfb"] as const) {
      const r = settleEspnOnly(sport, 20, 20)
      assert.equal(gradeAll(sport, r, "home"), "push", sport)
      assert.equal(gradeAll(sport, r, "away"), "push", sport)
    }
  })
  it("NBA and tennis: ordinary finals settle", () => {
    assert.equal(gradeAll("nba", settleEspnOnly("nba", 110, 104), "home"), "win")
    assert.equal(gradeAll("tennis", settleEspnOnly("tennis", 2, 1), "away"), "loss")
  })
  it("a postponed game voids after the grace period, not before", () => {
    const post = [res("espn", { status: "postponed", homeScore: null, awayScore: null })]
    assert.equal(run("nfl", post, fresh, at(5 * HOUR)).r.kind, "wait")
    const r = run("nfl", post, fresh, at(49 * HOUR)).r
    assert.deepEqual([r.kind, (r as { reason?: string }).reason], ["void", "postponed"])
    assert.equal(gradeAll("nfl", r, "home"), "void")
  })
  it("a cancelled game voids once the settle delay has passed", () => {
    const c = [res("espn", { status: "cancelled", homeScore: null, awayScore: null })]
    assert.equal(run("mls", c, fresh, at(10 * MIN)).r.kind, "wait")
    assert.equal(run("mls", c, fresh, at(7 * HOUR)).r.kind, "void")
  })
  it("a final that moves after it was first seen goes to review, never auto-settles", () => {
    const first = run("nba", [res("espn", { homeScore: 110, awayScore: 104 })], fresh, at(3 * HOUR))
    const later = run("nba", [res("espn", { homeScore: 110, awayScore: 107 })], first.stored, at(20 * HOUR))
    assert.deepEqual([later.r.kind, (later.r as { reason?: string }).reason], ["review", "final score changed after it was first seen"])
  })
  it("a final that is withdrawn (back to in progress) goes to review", () => {
    const first = run("nfl", [res("espn", {})], fresh, at(3 * HOUR))
    const later = run("nfl", [res("espn", { status: "in_progress", homeScore: null, awayScore: null })], first.stored, at(20 * HOUR))
    assert.equal(later.r.kind, "review")
  })
  it("an outage after a final was seen is a wait, not a review", () => {
    const first = run("nfl", [res("espn", {})], fresh, at(3 * HOUR))
    assert.equal(run("nfl", [], first.stored, at(20 * HOUR)).r.kind, "wait")
  })
  it("absurd scores go to review: negative, fractional, or beyond the sport's range", () => {
    for (const [sport, h, a] of [["nfl", 250, 3], ["mls", 40, 0], ["nhl", 30, 1], ["nba", -4, 100], ["nba", 100.5, 90], ["tennis", 9, 0]] as const) {
      const out = run(sport, [res("espn", { homeScore: h, awayScore: a }), ...(FREE_RESULT_FAMILIES[sport] === 2 ? [res(sport === "nhl" ? "nhl-api" : "mlb-statsapi", { homeScore: h, awayScore: a })] : [])], fresh, at(50 * HOUR)).r
      assert.equal(out.kind, "review", `${sport} ${h}-${a}`)
    }
    assert.equal(scoreProblem("nfl", 27, 24), null)
    assert.equal(scoreProblem("nfl", null, null), null)
  })
  it("an old unsettled review still refunds after the review timeout", () => {
    const first = run("nba", [res("espn", { homeScore: 110, awayScore: 104 })], fresh, at(3 * HOUR))
    const later = run("nba", [res("espn", { homeScore: 110, awayScore: 107 })], first.stored, at(8 * 24 * HOUR))
    assert.equal(later.r.kind, "void")
  })
  it("a legacy event with a final already seen but no stored score learns it without restarting the clock", () => {
    const legacy: Stored = { firstSeen: at(2 * HOUR), firstSeenScore: null }
    const out = run("nba", [res("espn", { homeScore: 100, awayScore: 90 })], legacy, at(10 * HOUR))
    assert.equal(out.stored.firstSeen!.getTime(), legacy.firstSeen!.getTime())
    assert.equal(out.stored.firstSeenScore, "100-90")
    assert.equal(out.r.kind, "final")
  })
})

describe("end to end with two free families (NHL, MLB)", () => {
  const both = (sport: "nhl" | "mlb", h: number, a: number) => [res("espn", { homeScore: h, awayScore: a }), res(sport === "nhl" ? "nhl-api" : "mlb-statsapi", { homeScore: h, awayScore: a })]
  for (const sport of ["nhl", "mlb"] as const) {
    it(`${sport}: ESPN alone waits for the league feed; both agreeing settle after the delay`, () => {
      const solo = run(sport, [res("espn", { homeScore: 4, awayScore: 2 })], fresh, at(20 * HOUR))
      assert.deepEqual([solo.r.kind, (solo.r as { reason?: string }).reason], ["wait", "waiting for a second source"])
      const first = run(sport, both(sport, 4, 2), fresh, at(3 * HOUR))
      assert.equal(first.r.kind, "wait")
      const done = run(sport, both(sport, 4, 2), first.stored, at(10 * HOUR)).r
      assert.equal(done.kind, "final")
      assert.equal(gradeAll(sport, done, "home"), "win")
    })
    it(`${sport}: the two families disagreeing go to review`, () => {
      const r = run(sport, [res("espn", { homeScore: 4, awayScore: 2 }), res(sport === "nhl" ? "nhl-api" : "mlb-statsapi", { homeScore: 4, awayScore: 3 })], fresh, at(20 * HOUR)).r
      assert.equal(r.kind, "review")
    })
    it(`${sport}: an equal final score (impossible in a real result) grades void, refunding`, () => {
      const done = run(sport, both(sport, 3, 3), run(sport, both(sport, 3, 3), fresh, at(HOUR)).stored, at(10 * HOUR)).r
      assert.equal(done.kind, "final")
      assert.equal(gradeAll(sport, done, "home"), "void")
      assert.equal(gradeAll(sport, done, "away"), "void")
    })
    it(`${sport}: both families reporting postponed void after the grace period`, () => {
      const post = [res("espn", { status: "postponed", homeScore: null, awayScore: null }), res(sport === "nhl" ? "nhl-api" : "mlb-statsapi", { status: "postponed", homeScore: null, awayScore: null })]
      assert.equal(run(sport, post, fresh, at(3 * HOUR)).r.kind, "wait")
      assert.equal(run(sport, post, fresh, at(49 * HOUR)).r.kind, "void")
    })
  }
})

describe("the money path imports no exchange code", () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const importsOf = (f: string) => [...readFileSync(join(here, f), "utf8").matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!)
  it("settlement and the new result providers do not import exchange, live or reprice", () => {
    for (const f of ["settlement.ts", "providers/nhl-api.ts", "providers/mlb-statsapi.ts", "providers/espn.ts"]) {
      assert.deepEqual(importsOf(f).filter((i) => /exchange|reprice|polymarket|kalshi|(^|\/)live(\/|$)/.test(i)), [], f)
    }
  })
})

describe("review fixes: doubleheaders and soccer beyond regulation", () => {
  const START = new Date("2026-10-20T19:00:00Z")
  const ev = { externalId: "x1", homeName: "Boston Red Sox", awayName: "New York Yankees", startsAt: START }
  const res = (id: string, startsAt: Date, h: number): EventResult => ({ source: "espn", externalId: id, homeName: "Boston Red Sox", awayName: "New York Yankees", startsAt, status: "final", homeScore: h, awayScore: 1 })

  it("a doubleheader matches the game with the closest start, not both", () => {
    const g1 = res("g1", new Date(START.getTime() - 60_000), 5)
    const g2 = res("g2", new Date(START.getTime() + 2 * 3600_000), 9)
    assert.deepEqual(resultsForEvent(ev, [g1, g2]).results.map((r) => r.externalId), ["g1"])
    assert.deepEqual(resultsForEvent({ ...ev, startsAt: g2.startsAt! }, [g1, g2]).results.map((r) => r.externalId), ["g2"])
  })

  it("an id match beats a name match, and equal gaps match neither", () => {
    const g1 = res("g1", new Date(START.getTime() - 3600_000), 5)
    const g2 = res("g2", new Date(START.getTime() + 3600_000), 9)
    assert.deepEqual(resultsForEvent({ ...ev, externalId: "g2" }, [g1, g2]).results.map((r) => r.externalId), ["g2"])
    assert.deepEqual(resultsForEvent(ev, [g1, g2]).results, [])
  })

  it("an MLS final decided in extra time or penalties goes to review, never to a draw", () => {
    const r: EventResult = { source: "espn", externalId: "m", status: "final", homeScore: 1, awayScore: 1, beyondRegulation: true }
    const out = resolveResult([r], { now: new Date(START.getTime() + 20 * 3600_000), startsAt: START, finalFirstSeenAt: START, sport: "mls" } as never)
    assert.equal(out.kind, "review")
  })
})
