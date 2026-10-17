import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { disconnectNameMatches } from "./disconnect-confirm.ts"

describe("disconnect typed confirmation", () => {
  it("accepts the institution name ignoring case and spacing", () => {
    assert.equal(disconnectNameMatches("fidelity investments", "Fidelity Investments"), true)
    assert.equal(disconnectNameMatches("  Fidelity   Investments ", "Fidelity Investments"), true)
  })
  it("rejects empty, partial and different names", () => {
    assert.equal(disconnectNameMatches("", "Fidelity"), false)
    assert.equal(disconnectNameMatches("Fidel", "Fidelity"), false)
    assert.equal(disconnectNameMatches("Schwab", "Fidelity"), false)
    assert.equal(disconnectNameMatches("", ""), false)
  })
})
