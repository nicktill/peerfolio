import { test } from "node:test"
import assert from "node:assert/strict"
import { matchGame, sameTeam } from "./live/match.ts"

const at = new Date("2026-10-18T00:30:00Z")
const cand = (a: string, b: string) => [{ id: "x", teams: [a, b] as [string, string], startsAt: at }]

test("MLS names that differ between ESPN and exchanges match", () => {
  for (const [espn, ex] of [
    ["Atlanta United FC", "Atlanta United"],
    ["Inter Miami CF", "Inter Miami"],
    ["Seattle Sounders FC", "Sounders"],
    ["Sporting Kansas City", "Sporting KC"],
    ["Los Angeles Galaxy", "LA Galaxy"],
    ["LA Galaxy", "Los Angeles Galaxy"],
    ["LAFC", "Los Angeles FC"],
    ["New York City FC", "NYCFC"],
    ["New York Red Bulls", "NY Red Bulls"],
    ["Real Salt Lake", "RSL"],
    ["D.C. United", "DC United"],
    ["Austin FC", "Austin"],
  ] as const) assert.ok(sameTeam(espn, ex) || matchGame({ homeName: espn, awayName: "Zzz", startsAt: at }, cand(ex, "Zzz"), { loose: true }), `${espn} ~ ${ex}`)
})

test("city-only names match loosely but ambiguous pairings stay unmatched", () => {
  const ref = { homeName: "Atlanta United FC", awayName: "Inter Miami CF", startsAt: at }
  assert.equal(matchGame(ref, cand("Atlanta", "Miami")), null)
  assert.ok(matchGame(ref, cand("Atlanta", "Inter Miami"), { loose: true }))
  assert.equal(matchGame({ homeName: "LAFC", awayName: "LA Galaxy", startsAt: at }, cand("Los Angeles", "Los Angeles"), { loose: true }), null)
  assert.equal(sameTeam("Atlanta United FC", "Atlanta Hawks"), false)
})
