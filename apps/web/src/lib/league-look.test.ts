import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ACCENT_KEYS, ACCENTS, EMOJI_GROUPS, crestToken, isLeagueEmoji, parseCrest, randomLook } from "./league-look.ts"

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

  it("accepts crests and rejects malformed ones", () => {
    const token = crestToken({ shape: "hex", glyph: "flame", effect: "glow", backdrop: "aurora" })
    assert.equal(isLeagueEmoji(token), true)
    assert.deepEqual(parseCrest(token), { shape: "hex", glyph: "flame", effect: "glow", backdrop: "aurora" })
    assert.equal(isLeagueEmoji("crest:hex:flame"), true)
    for (const bad of ["crest:", "crest:blob:flame", "crest:hex:nope", "crest:hex:flame:wiggle", "crest:hex:flame:glow:aurora:x", "crest:hex:<script>"]) assert.equal(isLeagueEmoji(bad), false, bad)
  })

  it("has a style for every accent", () => {
    for (const key of ACCENT_KEYS) assert.ok(ACCENTS[key].gradient.startsWith("from-"))
  })

  it("Surprise me always lands on a valid logo and accent", () => {
    for (let i = 0; i < 200; i++) {
      const look = randomLook()
      assert.ok(isLeagueEmoji(look.emoji))
      assert.ok(ACCENT_KEYS.includes(look.accent))
    }
    // The first draw picks the colour, the second decides crest (under .5) or emoji.
    assert.deepEqual(randomLook(() => 0), { emoji: "crest:shield:trophy:still:none", accent: "emerald" })
    const seq = [0, 0.9, 0]
    assert.deepEqual(randomLook(() => seq.shift() ?? 0), { emoji: all[0], accent: "emerald" })
    assert.ok(isLeagueEmoji(randomLook(() => 0.999999).emoji))
  })
})
