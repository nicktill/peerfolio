import assert from "node:assert/strict"
import { test } from "node:test"
import { averageCostInput, averageCostUpdate } from "./position-edit.ts"

test("editing Fidelity fractional shares keeps the exact imported average", () => {
  const initial = averageCostInput({ costBasis: 2904.55, quantity: 104.866 })
  assert.equal(Number(initial), 2904.55 / 104.866)
  assert.notEqual(Number(initial), 27.70)
  // A quantity-only save omits avgCost so the server uses the stored basis.
  assert.equal(averageCostUpdate(initial, initial), undefined)
  assert.equal(JSON.stringify({ quantity: 105, avgCost: averageCostUpdate(initial, initial) }), '{"quantity":105}')
})

test("explicitly changing or clearing an average remains possible", () => {
  assert.equal(averageCostUpdate("28.12345", "27.7"), 28.12345)
  assert.equal(averageCostUpdate("", "27.7"), null)
  assert.equal(averageCostUpdate("", ""), undefined)
  assert.equal(averageCostUpdate(""), null)
  assert.equal(averageCostInput(null), "")
  assert.equal(averageCostInput({ costBasis: null, quantity: 5 }), "")
})
