import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { BASE_RATE, nextRevealed } from "./reveal.ts"

describe("nextRevealed", () => {
  it("advances a few characters per frame for a small backlog", () => {
    const text = "x".repeat(40)
    const next = nextRevealed(text, 0, 16)
    assert.ok(next >= 1 && next <= 4, String(next))
  })

  it("always makes progress, and never passes the end", () => {
    assert.equal(nextRevealed("abc", 0, 0), 1)
    assert.equal(nextRevealed("abc", 2, 1000), 3)
    assert.equal(nextRevealed("abc", 3, 16), 3)
    assert.equal(nextRevealed("abc", 9, 16), 3)
  })

  it("catches up faster when far behind", () => {
    const small = nextRevealed("x".repeat(30), 0, 16)
    const big = nextRevealed("x".repeat(3000), 0, 16)
    assert.ok(big > small * 5, `${big} vs ${small}`)
  })

  it("is steady at the base rate", () => {
    const text = "x".repeat(60)
    let shown = 0
    for (let t = 0; t < 1000; t += 16) shown = nextRevealed(text, shown, 16)
    // Roughly BASE_RATE characters in a second, or the whole 60 if that is sooner.
    assert.ok(shown >= Math.min(60, BASE_RATE * 0.6), String(shown))
  })

  it("does not split a surrogate pair", () => {
    const text = "a😀b"
    for (let shown = 0; shown < text.length; shown++) {
      const next = nextRevealed(text, shown, 16)
      const code = text.charCodeAt(next - 1)
      assert.ok(next === text.length || code < 0xd800 || code > 0xdbff, `split at ${next}`)
    }
  })

  it("clamps one long frame so the first step after a pause stays small", () => {
    const text = "x".repeat(40)
    assert.ok(nextRevealed(text, 0, 60_000) <= 25)
  })
})
