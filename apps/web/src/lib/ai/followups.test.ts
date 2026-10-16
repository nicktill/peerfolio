import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { splitFollowUps, withoutFollowUps } from "./followups.ts"

describe("splitFollowUps", () => {
  it("leaves plain text alone", () => {
    assert.deepEqual(splitFollowUps("Just an answer."), { body: "Just an answer.", followUps: [] })
  })

  it("splits the trailer into questions", () => {
    const r = splitFollowUps("Verdict.\n\n<follow_ups>\n- Which holding drives it?\n2. Compare with SPY?\n* Show my sectors\n</follow_ups>")
    assert.equal(r.body, "Verdict.")
    assert.deepEqual(r.followUps, ["Which holding drives it?", "Compare with SPY?", "Show my sectors"])
  })

  it("hides the trailer while it is still being written", () => {
    assert.equal(splitFollowUps("Verdict.\n\n<follow_ups>\n- Which hol").body, "Verdict.")
    assert.deepEqual(splitFollowUps("Verdict.\n\n<follow_ups>\n- Which hol").followUps, [])
    // Only finished lines count while streaming.
    assert.deepEqual(splitFollowUps("A\n<follow_ups>\n- One?\n- Tw").followUps, ["One?"])
  })

  it("hides a half-typed opening tag", () => {
    for (const tail of ["<", "<fol", "<follow_up"]) assert.equal(splitFollowUps(`Answer.\n${tail}`).body, "Answer.", tail)
    // A real "<" in prose is kept once it can no longer become the tag.
    assert.equal(splitFollowUps("a < b").body, "a < b")
  })

  it("keeps at most three, drops duplicates, long lines and markup", () => {
    const long = "x".repeat(200)
    const r = splitFollowUps(`A\n<follow_ups>\n- One?\n- One?\n- ${long}\n- <b>bad</b>\n- Two?\n- Three?\n- Four?\n</follow_ups>`)
    assert.deepEqual(r.followUps, ["One?", "Two?", "Three?"])
  })

  it("drops anything after the trailer", () => {
    assert.equal(splitFollowUps("A\n<follow_ups>\n- Q?\n</follow_ups>\ntrailing").body, "A")
  })

  it("withoutFollowUps gives the history form", () => {
    assert.equal(withoutFollowUps("A\n<follow_ups>\n- Q?\n</follow_ups>"), "A")
  })
})
