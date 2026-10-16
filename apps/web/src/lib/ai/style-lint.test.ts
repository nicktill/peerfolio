import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { lintAnswer, wordCount } from "./style-lint.ts"
import { SAMPLES } from "./style-samples.ts"

const tail = "\n<follow_ups>\n- Is that too much?\n- How does it compare?\n</follow_ups>"

describe("lintAnswer on the exemplar answers", () => {
  for (const s of SAMPLES) {
    it(`"${s.question}" passes`, () => {
      assert.deepEqual(lintAnswer(s.answer, { briefing: s.briefing, clarifying: s.clarifying }), [])
    })
  }
})

describe("lintAnswer catches", () => {
  it("a wall of text", () => {
    const wall = "word ".repeat(180).trim() + "."
    const found = lintAnswer(wall + tail)
    assert.ok(found.some((p) => p.startsWith("too long")), found.join())
    assert.ok(found.some((p) => p.includes("paragraph of")), found.join())
  })

  it("a briefing that runs past its tighter limit", () => {
    const text = Array.from({ length: 80 }, (_, i) => `w${i}`).join(" ") + "."
    assert.ok(lintAnswer(text + tail, { briefing: true }).some((p) => p.startsWith("too long")))
    assert.ok(!lintAnswer(text + tail).some((p) => p.startsWith("too long")))
  })

  it("bold everywhere and bold headings", () => {
    const found = lintAnswer("**One** and **two** and **three** and **four**.\n\n**Risks**\n\nText." + tail)
    assert.ok(found.some((p) => p.startsWith("too much bold")))
    assert.ok(found.includes("a bold line used as a heading"))
  })

  it("headings, rules, emoji, filler and boilerplate", () => {
    const found = lintAnswer("Sure, here you go.\n\n## Summary\n\n---\n\nGreat question! This is not financial advice 🚀" + tail)
    for (const want of ["uses a heading", "uses a horizontal rule", "uses emoji", "boilerplate disclaimer or filler", "opens with filler instead of the answer"]) assert.ok(found.includes(want), want)
  })

  it("missing or excessive follow-ups", () => {
    assert.ok(lintAnswer("Short answer.").some((p) => p.includes("follow-ups")))
    assert.ok(lintAnswer("Short answer.\n<follow_ups>\n- A?\n- B?\n- C?\n- D?\n</follow_ups>").every((p) => !p.includes("follow-ups")))
  })

  it("too many bullets", () => {
    const bullets = Array.from({ length: 7 }, (_, i) => `- point ${i}`).join("\n")
    assert.ok(lintAnswer(`Verdict.\n\n${bullets}${tail}`).some((p) => p.includes("bullets")))
  })

  it("counts words without the trailer", () => {
    assert.equal(wordCount("a b  c\nd"), 4)
  })
})
