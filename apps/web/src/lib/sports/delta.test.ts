import test from "node:test"
import assert from "node:assert/strict"
import { deltaLabel, deltaTone, freshSeen, linearOdds, numberDelta, priceDelta, shouldAnnounce } from "./delta.ts"

test("price delta direction and size", () => {
  assert.deepEqual(priceDelta(-120, -105), { dir: "up", diff: 15 })
  assert.deepEqual(priceDelta(150, 135), { dir: "down", diff: 15 })
  assert.deepEqual(priceDelta(-110, 100), { dir: "up", diff: 10 })
  assert.deepEqual(priceDelta(105, -105), { dir: "down", diff: 10 })
  assert.equal(priceDelta(-110, -110), null)
  assert.equal(priceDelta(null, -110), null)
  assert.equal(priceDelta(-100, 100), null)
  assert.equal(linearOdds(100), 0)
})

test("number delta", () => {
  assert.deepEqual(numberDelta(14, 21), { dir: "up", diff: 7 })
  assert.deepEqual(numberDelta(55, 52), { dir: "down", diff: 3 })
  assert.equal(numberDelta(2, 2), null)
  assert.equal(numberDelta(undefined, 2), null)
})

test("labels and tones", () => {
  assert.equal(deltaLabel({ dir: "up", diff: 7 }, "score"), "+7")
  assert.equal(deltaLabel({ dir: "up", diff: 15 }, "price"), "▲ +15")
  assert.equal(deltaLabel({ dir: "down", diff: 3 }, "pct"), "▼ -3%")
  assert.equal(deltaTone({ dir: "down", diff: 3 }, "price"), "bad")
  assert.equal(deltaTone({ dir: "up", diff: 3 }, "score"), "good")
  assert.equal(deltaTone({ dir: "up", diff: 3 }, "pct"), "flat")
})

test("seen values expire and announcements are rate limited", () => {
  assert.equal(freshSeen({ v: 5, t: 1000 }, 2000), 5)
  assert.equal(freshSeen({ v: 5, t: 0 }, 31 * 60_000), null)
  assert.equal(freshSeen(null, 5), null)
  assert.equal(shouldAnnounce(null, 100), true)
  assert.equal(shouldAnnounce(100, 5000), false)
  assert.equal(shouldAnnounce(100, 20_000), true)
})
