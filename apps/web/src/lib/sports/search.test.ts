import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { matchesSearch } from "./search.ts"

describe("matchesSearch", () => {
  it("matches teams, players and league names ignoring case and accents", () => {
    assert.ok(matchesSearch("eagles", ["Philadelphia Eagles", "Dallas Cowboys"], "nfl"))
    assert.ok(matchesSearch("DJOKOVIC", ["Novak Djoković", "Carlos Alcaraz"], "tennis"))
    assert.ok(matchesSearch("nfl", ["A", "B"], "nfl"))
    assert.ok(matchesSearch("college", ["A", "B"], "cfb"))
    assert.ok(matchesSearch("  ", ["A"], "nba"))
  })
  it("needs every word and rejects misses", () => {
    assert.ok(matchesSearch("phi cow", ["Philadelphia Eagles", "Dallas Cowboys"], "nfl"))
    assert.ok(!matchesSearch("xyz", ["Philadelphia Eagles", "Dallas Cowboys"], "nfl"))
    assert.ok(!matchesSearch("eagles nba", ["Philadelphia Eagles", "Dallas Cowboys"], "nfl"))
  })
})
