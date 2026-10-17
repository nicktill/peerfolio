import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { resultsForEvent } from "../settlement.ts"
import type { EventResult } from "../types.ts"
import { mapMlbStatus, MlbResultsProvider, normalizeMlbSchedule } from "./mlb-statsapi.ts"
import { mapNhlStatus, NhlResultsProvider, normalizeNhlSchedule } from "./nhl-api.ts"

const here = dirname(fileURLToPath(import.meta.url))
const load = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"))
const nhlFx = load("nhl-schedule-2026-10-16.json")
const mlbFx = load("mlb-schedule-2026-10-14.json")
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const fake = (body: unknown, status = 200) => {
  const calls: string[] = []
  const f = (async (url: unknown) => (calls.push(String(url)), json(body, status))) as unknown as typeof fetch
  return { f, calls }
}

describe("NHL official API results", () => {
  it("normalises a recorded schedule: final scores, live and future games", () => {
    const rs = normalizeNhlSchedule(nhlFx)
    assert.equal(rs.length, 16)
    const g = rs.find((r) => r.externalId === "2026020119")!
    assert.deepEqual([g.status, g.homeScore, g.awayScore, g.homeName, g.awayName, g.family], ["final", 5, 2, "Colorado Avalanche", "Pittsburgh Penguins", "nhl-api"])
    assert.equal(g.startsAt!.toISOString(), "2026-10-17T01:00:00.000Z")
    const live = rs.filter((r) => r.status === "in_progress")
    assert.equal(live.length, 2)
    assert.ok(live.every((r) => r.homeScore === null && r.awayScore === null), "a live score is never a final score")
    assert.ok(rs.filter((r) => r.status === "scheduled").length >= 10)
  })

  it("maps postponed, cancelled, suspended and finished states", () => {
    assert.equal(mapNhlStatus({ gameState: "FUT", gameScheduleState: "PPD" }), "postponed")
    assert.equal(mapNhlStatus({ gameState: "FUT", gameScheduleState: "CNCL" }), "cancelled")
    assert.equal(mapNhlStatus({ gameState: "LIVE", gameScheduleState: "SUSP" }), "in_progress")
    assert.equal(mapNhlStatus({ gameState: "OFF", gameScheduleState: "OK" }), "final")
    assert.equal(mapNhlStatus({ gameState: "FINAL", gameScheduleState: "OK" }), "final")
    assert.equal(mapNhlStatus({ gameState: "CRIT", gameScheduleState: "OK" }), "in_progress")
  })

  it("never calls a final with a missing score a final", () => {
    const board = clone(nhlFx)
    delete board.gameWeek[0].games[0].homeTeam.score
    const g = normalizeNhlSchedule(board).find((r) => r.externalId === String(board.gameWeek[0].games[0].id))!
    assert.equal(g.status, "in_progress")
    assert.equal(g.homeScore, null)
  })

  it("matches an event written the ESPN way by name and start, either orientation", () => {
    const all = normalizeNhlSchedule(nhlFx)
    const event = { externalId: "espn-1", homeName: "Colorado Avalanche", awayName: "Pittsburgh Penguins", startsAt: new Date("2026-10-17T01:00:00Z") }
    const same = resultsForEvent(event, all)
    assert.equal(same.results.length, 1)
    assert.deepEqual([same.results[0]!.homeScore, same.results[0]!.awayScore], [5, 2])
    const swapped = resultsForEvent({ ...event, homeName: "Pittsburgh Penguins", awayName: "Colorado Avalanche" }, all)
    assert.deepEqual([swapped.results[0]!.homeScore, swapped.results[0]!.awayScore], [2, 5])
    assert.deepEqual(resultsForEvent({ ...event, startsAt: new Date("2026-10-19T01:00:00Z") }, all).results, [], "wrong day never matches")
  })

  it("fetches a week per call, caches, and ignores other sports", async () => {
    const { f, calls } = fake(nhlFx)
    const p = new NhlResultsProvider(f, "https://example.test/v1")
    const ev = [{ externalId: "x", homeName: "a", awayName: "b", startsAt: new Date("2026-10-17T01:00:00Z") }]
    assert.equal((await p.fetchResults("nhl", ev)).length, 16)
    await p.fetchResults("nhl", ev)
    assert.equal(calls.length, 1, "second ask served from the cache")
    assert.match(calls[0]!, /^https:\/\/example\.test\/v1\/schedule\/2026-10-1\d$/)
    assert.deepEqual(await p.fetchResults("nba", ev), [])
    assert.equal(calls.length, 1)
  })

  it("throws on a failed fetch so settlement counts an outage, not a missing result", async () => {
    const p = new NhlResultsProvider(fake({}, 503).f)
    await assert.rejects(p.fetchResults("nhl", [{ externalId: "x", homeName: "a", awayName: "b", startsAt: new Date() }]), /503/)
  })

  it("declares its own family and sport", () => {
    const p = new NhlResultsProvider(fake({}).f)
    assert.deepEqual([p.family, p.sports], ["nhl-api", ["nhl"]])
  })
})

describe("MLB Stats API results", () => {
  it("normalises a recorded schedule: finals, a postponed game, scheduled games", () => {
    const rs = normalizeMlbSchedule(mlbFx)
    assert.equal(rs.length, 5, "a game listed on two dates counts once")
    const final = rs.find((r) => r.externalId === "849818")!
    assert.deepEqual([final.status, final.homeScore, final.awayScore, final.homeName, final.awayName, final.family], ["final", 3, 2, "Cleveland Guardians", "Tampa Bay Rays", "mlb-statsapi"])
    const pp = rs.find((r) => r.externalId === "849817")!
    assert.equal(pp.status, "postponed", "abstractGameState Final must not hide a postponement")
    assert.equal(pp.homeScore, null)
    assert.equal(rs.filter((r) => r.status === "scheduled").length, 1)
  })

  it("maps detailed states", () => {
    assert.equal(mapMlbStatus({ abstractGameState: "Final", detailedState: "Postponed" }), "postponed")
    assert.equal(mapMlbStatus({ abstractGameState: "Final", detailedState: "Cancelled" }), "cancelled")
    assert.equal(mapMlbStatus({ abstractGameState: "Live", detailedState: "Suspended: Rain" }), "in_progress")
    assert.equal(mapMlbStatus({ abstractGameState: "Live", detailedState: "In Progress" }), "in_progress")
    assert.equal(mapMlbStatus({ abstractGameState: "Live", detailedState: "Delayed: Rain" }), "in_progress")
    assert.equal(mapMlbStatus({ abstractGameState: "Final", detailedState: "Final" }), "final")
    assert.equal(mapMlbStatus({ abstractGameState: "Final", detailedState: "Completed Early: Rain" }), "final")
    assert.equal(mapMlbStatus({ abstractGameState: "Preview", detailedState: "Pre-Game" }), "scheduled")
    assert.equal(mapMlbStatus({ abstractGameState: "Final", detailedState: "Forfeit" }), "retired")
  })

  it("matches by name and start, including the old and accent-free spellings", () => {
    const all = normalizeMlbSchedule(mlbFx)
    const event = { externalId: "espn-9", homeName: "Los Angeles Dodgers", awayName: "Milwaukee Brewers", startsAt: new Date("2026-10-16T00:00:00Z") }
    const r = resultsForEvent(event, all).results
    assert.deepEqual([r[0]!.homeScore, r[0]!.awayScore], [4, 6])
    const board = { dates: [{ games: [{ gamePk: 1, gameDate: "2026-10-16T00:00:00Z", status: { detailedState: "Final", abstractGameState: "Final" }, teams: { home: { team: { name: "Athletics" }, score: 1 }, away: { team: { name: "Arizona Diamondbacks" }, score: 0 } } }] }] }
    const a = resultsForEvent({ externalId: "z", homeName: "Oakland Athletics", awayName: "Arizona D-backs", startsAt: new Date("2026-10-16T00:00:00Z") }, normalizeMlbSchedule(board)).results
    assert.equal(a.length, 1)
  })

  it("asks one ranged call, caches it, and throws on a failure", async () => {
    const { f, calls } = fake(mlbFx)
    const p = new MlbResultsProvider(f, "https://example.test/api/v1")
    const ev = [{ externalId: "x", homeName: "a", awayName: "b", startsAt: new Date("2026-10-16T00:00:00Z") }]
    assert.equal((await p.fetchResults("mlb", ev)).length, 5)
    await p.fetchResults("mlb", ev)
    assert.equal(calls.length, 1)
    assert.match(calls[0]!, /schedule\?sportId=1&startDate=2026-10-15&endDate=2026-10-17$/)
    assert.deepEqual(await p.fetchResults("nhl", ev), [])
    await assert.rejects(new MlbResultsProvider(fake({}, 500).f).fetchResults("mlb", ev), /500/)
  })

  it("declares its own family and sport", () => {
    const p = new MlbResultsProvider(fake({}).f)
    assert.deepEqual([p.family, p.sports], ["mlb-statsapi", ["mlb"]])
  })
})

describe("official results providers stay on the results side", () => {
  const importsOf = (f: string) => [...readFileSync(join(here, f), "utf8").matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!)
  it("import only types: no exchange, live, reprice or odds code", () => {
    for (const f of ["nhl-api.ts", "mlb-statsapi.ts"]) assert.deepEqual(importsOf(f), ["../types.ts"], f)
  })
})

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
export type { EventResult }
