import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { describeSeason, formatCountdown, formatPoints, formatRecord, ordinal, roundProgress } from "./season-format.ts"

describe("season formatting", () => {
  it("counts down in at most two units", () => {
    assert.equal(formatCountdown(0), "now")
    assert.equal(formatCountdown(-5), "now")
    assert.equal(formatCountdown(30_000), "under 1m")
    assert.equal(formatCountdown(12 * 60_000), "12m")
    assert.equal(formatCountdown(5 * 3_600_000 + 12 * 60_000), "5h 12m")
    assert.equal(formatCountdown(5 * 3_600_000), "5h")
    assert.equal(formatCountdown(2 * 86_400_000 + 4 * 3_600_000 + 59 * 60_000), "2d 4h")
    assert.equal(formatCountdown(3 * 86_400_000), "3d")
  })

  it("reports progress through a round, clamped", () => {
    const [a, b] = ["2026-10-12T00:00:00Z", "2026-10-19T00:00:00Z"]
    assert.equal(roundProgress(a!, b!, new Date("2026-10-11T00:00:00Z").getTime()), 0)
    assert.equal(roundProgress(a!, b!, new Date("2026-10-15T12:00:00Z").getTime()), 0.5)
    assert.equal(roundProgress(a!, b!, new Date("2026-11-01T00:00:00Z").getTime()), 1)
  })

  it("describes a season", () => {
    assert.equal(describeSeason({ mode: "trading", roundCount: null, picksPerRound: null }), "Trading / open-ended")
    assert.equal(describeSeason({ mode: "draft", roundCount: 4, picksPerRound: 5 }), "Draft / 5 picks / 4 rounds")
    assert.equal(describeSeason({ mode: "draft", roundCount: 1, picksPerRound: 3 }), "Draft / 3 picks / 1 round")
  })

  it("writes ordinals, records and points", () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd"])
    assert.equal(formatRecord({ wins: 2, losses: 1, ties: 0 }), "2-1")
    assert.equal(formatRecord({ wins: 2, losses: 1, ties: 1 }), "2-1-1")
    assert.equal(formatPoints(7), "7")
    assert.equal(formatPoints(3.5), "3.5")
  })
})
