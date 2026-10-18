import assert from "node:assert/strict"
import { test } from "node:test"
import { combinedDecimal, decimalToAmerican, parlayQuote } from "./parlay-math.ts"

test("two -110 legs combine to about +264", () => {
  const q = parlayQuote([-110, -110])!
  assert.equal(q.american, 264)
  assert.ok(Math.abs(q.decimal - 3.6446) < 0.001)
})

test("three even-ish legs", () => {
  assert.equal(parlayQuote([100, 100, 100])!.american, 700)
  assert.equal(parlayQuote([-110, -110, -110])!.american, 596)
})

test("favourites combine to a negative price", () => {
  assert.equal(parlayQuote([-300, -300])!.american, -129)
  assert.equal(decimalToAmerican(1.5), -200)
  assert.equal(decimalToAmerican(1.25), -400)
  assert.equal(decimalToAmerican(2), 100)
})

test("return rounds down to a whole credit and to win is the profit", () => {
  const q = parlayQuote([-110, -110], 50)!
  assert.equal(q.totalReturn, 182)
  assert.equal(q.toWin, 132)
})

test("no stake means no return; no legs means no quote", () => {
  assert.equal(parlayQuote([150, 150], 0)!.toWin, 0)
  assert.equal(parlayQuote([]), null)
  assert.equal(combinedDecimal([]), null)
})

test("invalid prices are refused rather than guessed", () => {
  assert.equal(parlayQuote([150, 0]), null)
  assert.equal(parlayQuote([150, Number.NaN]), null)
  assert.equal(parlayQuote([150, -50]), null)
})
