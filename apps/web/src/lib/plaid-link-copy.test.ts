import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { preLinkNotice, linkUnavailable } from "./plaid-link-copy.ts"

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

describe("pre-link heads-up", () => {
  it("states the limit, the no-refund rule and what is left", () => {
    const fresh = preLinkNotice({ capApplies: true, used: 0, limit: 2 })
    assert.equal(fresh?.body, "You can connect up to 2 brokerages. Only connect an account you plan to keep \u2014 disconnecting one still counts toward your 2.")
    assert.equal(fresh?.remaining, "You have 2 left.")
    assert.equal(fresh?.continueLabel, "Continue")
    assert.equal(preLinkNotice({ capApplies: true, used: 1, limit: 2 })?.remaining, "You have 1 left of 2.")
  })
  it("is skipped where the cap does not apply or no slot is left", () => {
    assert.equal(preLinkNotice({ capApplies: false, used: 0, limit: 2 }), null)
    assert.equal(preLinkNotice({ capApplies: true, used: 2, limit: 2 }), null)
    assert.equal(preLinkNotice({ capApplies: true, used: 5, limit: 2 }), null)
  })
})

describe("copy follows the user's effective limit", () => {
  it("uses it in the pill, caption and pre-link dialog", () => {
    const capped = linkUnavailable("user_limit", { used: 5, limit: 5 })
    assert.equal(capped.label, "5 of 5 connected")
    assert.equal(capped.caption?.lead, "Only 5 brokerage connections per account for now. More coming soon.")
    const dialog = preLinkNotice({ capApplies: true, used: 1, limit: 5 })
    assert.match(dialog!.body, /up to 5 brokerages/)
    assert.match(dialog!.body, /toward your 5\./)
    assert.equal(dialog!.remaining, "You have 4 left of 5.")
    assert.match(preLinkNotice({ capApplies: true, used: 0, limit: 1 })!.body, /up to 1 brokerage\./)
    assert.equal(linkUnavailable("user_limit", { used: 0, limit: 0 }).label, "Linking unavailable")
  })
})
