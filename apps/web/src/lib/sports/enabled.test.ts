import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { liveSlate } from "./live/plan.ts"
import { disabledSports, enabledSports, isSportEnabled, pausedMessage } from "./enabled.ts"

describe("SPORTS_DISABLED", () => {
  it("pauses tennis when unset", () => {
    assert.equal(isSportEnabled("tennis", undefined), false)
    assert.equal(isSportEnabled("nfl", undefined), true)
  })
  it("pauses nothing when empty or none", () => {
    assert.equal(isSportEnabled("tennis", ""), true)
    assert.equal(isSportEnabled("tennis", "none"), true)
    assert.equal(disabledSports("").size, 0)
  })
  it("reads a comma list, ignoring case and spaces", () => {
    assert.equal(isSportEnabled("nhl", " NHL , mlb"), false)
    assert.equal(isSportEnabled("tennis", "nhl"), true)
  })
  it("filters a list and keeps its order", () => {
    assert.deepEqual(enabledSports(["nfl", "tennis", "nba"], undefined), ["nfl", "nba"])
    assert.deepEqual(enabledSports(["nfl", "tennis", "nba"], ""), ["nfl", "tennis", "nba"])
  })
  it("words the rejection", () => {
    assert.equal(pausedMessage("tennis"), "Tennis is paused")
  })
})

describe("the live worker plan", () => {
  const now = new Date("2026-10-18T12:00:00Z")
  const ev = (id: string, sport: string) => ({ id, sport, status: "scheduled", startsAt: new Date(now.getTime() - 30 * 60_000), homeName: "A", awayName: "B" })
  it("never polls a paused sport", () => {
    const saved = process.env.SPORTS_DISABLED
    try {
      delete process.env.SPORTS_DISABLED
      assert.deepEqual(liveSlate([ev("1", "tennis"), ev("2", "nba")], now).map((e) => e.id), ["2"])
      process.env.SPORTS_DISABLED = ""
      assert.deepEqual(liveSlate([ev("1", "tennis"), ev("2", "nba")], now).map((e) => e.id), ["1", "2"])
    } finally {
      if (saved === undefined) delete process.env.SPORTS_DISABLED
      else process.env.SPORTS_DISABLED = saved
    }
  })
})
