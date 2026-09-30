import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ACCENT_KEYS, ACCENTS, EMOJI_GROUPS, accentFor, isLeagueEmoji, randomLook } from "./league-look.ts"

describe("league look", () => {
  const all = EMOJI_GROUPS.flatMap((g) => [...g.emojis])

  it("has no duplicate logos, and every one is a single emoji", () => {
    assert.equal(new Set(all).size, all.length)
    for (const e of all) assert.equal([...new Intl.Segmenter().segment(e)].length, 1, `${e} is not one emoji`)
  })

  it("keeps every logo the old picker offered, so existing leagues still match", () => {
    for (const e of ["🏈", "🏀", "⚾", "🥊", "🎰", "🚀", "🦍", "💎"]) assert.ok(isLeagueEmoji(e), e)
  })

  it("accepts only logos from the set", () => {
    assert.equal(isLeagueEmoji("🏆"), true)
    for (const bad of ["", "A", "hello", "🏈🏀", "<script>", "🏈 "]) assert.equal(isLeagueEmoji(bad), false, JSON.stringify(bad))
  })

  it("has a style for every accent, and falls back to emerald for an unknown one", () => {
    for (const key of ACCENT_KEYS) assert.ok(ACCENTS[key].gradient.startsWith("from-"))
    assert.equal(accentFor("nope"), ACCENTS.emerald)
    assert.equal(accentFor(undefined), ACCENTS.emerald)
  })

  it("Surprise me always lands on a valid logo and accent", () => {
    for (let i = 0; i < 200; i++) {
      const look = randomLook()
      assert.ok(isLeagueEmoji(look.emoji))
      assert.ok(ACCENT_KEYS.includes(look.accent))
    }
    assert.deepEqual(randomLook(() => 0), { emoji: all[0], accent: "emerald" })
    assert.ok(isLeagueEmoji(randomLook(() => 0.999999).emoji))
  })
})
