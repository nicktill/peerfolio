import { test } from "node:test"
import assert from "node:assert/strict"
import { brandFor } from "./brokerages.ts"

test("recognises common brokerages however they're typed", () => {
  assert.equal(brandFor("Fidelity")?.name, "Fidelity")
  assert.equal(brandFor("fidelity investments")?.name, "Fidelity")
  assert.equal(brandFor("Robinhood")?.ticker, "HOOD")
  assert.equal(brandFor("E*TRADE")?.name, "E*TRADE")
  assert.equal(brandFor("TD Ameritrade")?.name, "Charles Schwab")
  assert.equal(brandFor("Chase")?.ticker, "JPM")
})

test("matches whole words only", () => {
  assert.equal(brandFor("Republic Bank"), null)
  assert.equal(brandFor("Citizens Bank"), null)
  assert.equal(brandFor("Allyson's savings"), null)
})

test("unknown or empty names have no brand", () => {
  assert.equal(brandFor("My credit union"), null)
  assert.equal(brandFor(""), null)
  assert.equal(brandFor(null), null)
})
