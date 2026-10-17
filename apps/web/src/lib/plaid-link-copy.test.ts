import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { linkUnavailable } from "./plaid-link-copy.ts"

describe("disabled linking button copy", () => {
  it("shows a short pill and a contact caption when the global pool is full", () => {
    const copy = linkUnavailable("full")
    assert.equal(copy.label, "Linking full")
    assert.equal(`${copy.caption?.lead}${copy.caption?.link}${copy.caption?.tail}`, "Brokerage linking is full right now. Reach out to connect.")
    assert.equal(copy.caption?.link, "Reach out")
    assert.ok(copy.label.length <= 16)
  })
  it("shows used slots in the pill and the long note outside it at the per-user cap", () => {
    const copy = linkUnavailable("user_limit", { used: 2, limit: 2 })
    assert.equal(copy.label, "2 of 2 connected")
    assert.equal(copy.caption?.lead, "Only 2 brokerage connections per account for now. More coming soon.")
    assert.equal(copy.tip, copy.caption?.lead)
    assert.ok(!copy.label.includes("Only"))
  })
  it("never shows more than the limit in the pill", () => {
    assert.equal(linkUnavailable("user_limit", { used: 3, limit: 2 }).label, "2 of 2 connected")
  })
  it("keeps other states short", () => {
    for (const code of ["paused", "off", "unconfigured"] as const) assert.ok(linkUnavailable(code).label.length <= 30)
  })
})
