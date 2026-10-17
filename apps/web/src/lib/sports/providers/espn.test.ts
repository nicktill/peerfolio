import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { EspnResultsProvider, mapStatus, normalizeCompetition, normalizeScoreboard } from "./espn.ts"

const nfl = {
  events: [
    {
      date: "2026-10-17T20:00Z",
      competitions: [
        {
          id: "401",
          status: { type: { name: "STATUS_FINAL", state: "post", completed: true } },
          competitors: [
            { homeAway: "home", score: "27", team: { displayName: "Denver Broncos" } },
            { homeAway: "away", score: "24", team: { displayName: "Seattle Seahawks" } },
          ],
        },
        { id: "402", status: { type: { name: "STATUS_POSTPONED", state: "pre" } }, competitors: [{ homeAway: "home", score: "0", team: { displayName: "A" } }, { homeAway: "away", score: "0", team: { displayName: "B" } }] },
        { id: "403", status: { type: { name: "STATUS_FINAL", state: "post", completed: true } }, competitors: [{ homeAway: "home", score: "", team: { displayName: "C" } }, { homeAway: "away", score: "3", team: { displayName: "D" } }] },
      ],
    },
  ],
}

const tennis = {
  events: [
    {
      groupings: [
        {
          competitions: [
            {
              id: "t1",
              date: "2026-10-17T10:00Z",
              status: { type: { name: "STATUS_FINAL", completed: true } },
              competitors: [
                { order: 1, athlete: { displayName: "Carlos Alcaraz" }, linescores: [{ value: 6 }, { value: 6 }, { value: 7 }], winner: true },
                { order: 2, athlete: { displayName: "Jannik Sinner" }, linescores: [{ value: 3 }, { value: 7 }, { value: 5 }] },
              ],
            },
            { id: "t2", status: { type: { name: "STATUS_RETIRED" } }, date: "2026-10-17T12:00Z", competitors: [{ order: 1, athlete: { displayName: "A" }, linescores: [] }, { order: 2, athlete: { displayName: "B" }, linescores: [] }] },
          ],
        },
      ],
    },
  ],
}

describe("ESPN results", () => {
  it("reads a final game with home and away scores", () => {
    const [g] = normalizeScoreboard(nfl, "nfl")
    assert.deepEqual([g!.status, g!.homeScore, g!.awayScore, g!.homeName, g!.awayName, g!.family], ["final", 27, 24, "Denver Broncos", "Seattle Seahawks", "espn"])
  })

  it("keeps a postponed game postponed, and never calls a final with no score a final", () => {
    const rs = normalizeScoreboard(nfl, "nfl")
    assert.equal(rs.find((r) => r.externalId === "402")!.status, "postponed")
    const bad = rs.find((r) => r.externalId === "403")!
    assert.equal(bad.status, "in_progress")
    assert.equal(bad.homeScore, null)
  })

  it("counts tennis sets won, and treats a retirement as a retirement", () => {
    const rs = normalizeScoreboard(tennis, "tennis")
    const m = rs.find((r) => r.externalId === "t1")!
    assert.deepEqual([m.status, m.homeScore, m.awayScore], ["final", 2, 1])
    assert.equal(rs.find((r) => r.externalId === "t2")!.status, "retired")
  })

  it("marks an MLS final that went to extra time or penalties as beyond regulation", () => {
    const comp = (name: string) => ({ id: "m1", date: "2026-11-01T20:00Z", status: { type: { name, completed: true } }, competitors: [{ homeAway: "home", score: "1", team: { displayName: "A" } }, { homeAway: "away", score: "1", team: { displayName: "B" } }] })
    assert.equal(normalizeCompetition(comp("STATUS_FINAL_PEN"), undefined, "mls")!.beyondRegulation, true)
    assert.equal(normalizeCompetition(comp("STATUS_FINAL_AET"), undefined, "mls")!.beyondRegulation, true)
    assert.equal(normalizeCompetition(comp("STATUS_FINAL"), undefined, "mls")!.beyondRegulation, undefined)
    assert.equal(normalizeCompetition(comp("STATUS_FINAL_PEN"), undefined, "nba")!.beyondRegulation, undefined)
  })

  it("maps statuses", () => {
    assert.equal(mapStatus({ type: { name: "STATUS_FINAL_OT", completed: true } }), "final")
    assert.equal(mapStatus({ type: { state: "in", name: "STATUS_IN_PROGRESS" } }), "in_progress")
    assert.equal(mapStatus({ type: { name: "STATUS_SCHEDULED", state: "pre" } }), "scheduled")
    assert.equal(mapStatus({ type: { name: "STATUS_CANCELED" } }), "cancelled")
  })

  it("asks one scoreboard day at a time (ranges 400 for NFL/NBA) and surfaces a failure without the URL", async () => {
    const asked: string[] = []
    const ok = new EspnResultsProvider((async (u: string) => (asked.push(u), new Response(JSON.stringify(nfl)))) as unknown as typeof fetch)
    const out = await ok.fetchResults("nfl", [{ externalId: "x", homeName: "Denver Broncos", awayName: "Seattle Seahawks", startsAt: new Date("2026-10-17T20:00Z") }])
    assert.equal(out.length, 3, "the same game seen on several days is returned once")
    assert.deepEqual(asked.map((u) => u.match(/dates=(\d+)/)![1]), ["20261016", "20261017", "20261018"])
    assert.ok(asked.every((u) => !/dates=\d+-\d+/.test(u)))
    const bad = new EspnResultsProvider((async () => new Response("no", { status: 503 })) as unknown as typeof fetch)
    await assert.rejects(bad.fetchResults("nfl", [{ externalId: "x", homeName: "a", awayName: "b", startsAt: new Date() }]), /503/)
  })
})
