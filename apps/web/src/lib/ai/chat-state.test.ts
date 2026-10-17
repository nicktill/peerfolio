import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { applyEvent, historyForRetry, markStopped, patchLastMessage, requestMessages, withoutErrors, type Msg } from "./chat-state.ts"
import type { XRay } from "./portfolio-xray.ts"

const m = (role: Msg["role"], text: string, extra: Partial<Msg> = {}): Msg => ({ id: `${role}-${text}`, role, text, ...extra })
const blank = m("assistant", "")

describe("applyEvent", () => {
  it("appends text deltas in order", () => {
    let msg = blank
    for (const d of ["Hel", "lo", " ", "🚀"]) msg = applyEvent(msg, { type: "text", delta: d })
    assert.equal(msg.text, "Hello 🚀")
  })

  it("attaches the xray without touching the text", () => {
    const xray = { marker: 1 } as unknown as XRay
    const msg = applyEvent(m("assistant", "so far"), { type: "xray", data: xray })
    assert.equal(msg.xray, xray)
    assert.equal(msg.text, "so far")
  })

  it("sets the error and keeps partial text", () => {
    const msg = applyEvent(m("assistant", "partial"), { type: "error", message: "boom" })
    assert.equal(msg.error, "boom")
    assert.equal(msg.text, "partial")
  })

  it("leaves the message alone for status and done, and never mutates its input", () => {
    assert.equal(applyEvent(blank, { type: "status", stage: "writing" }), blank)
    assert.equal(applyEvent(blank, { type: "done" }), blank)
    const frozen = Object.freeze({ ...blank })
    assert.doesNotThrow(() => applyEvent(frozen, { type: "text", delta: "x" }))
    assert.equal(frozen.text, "")
  })
})

describe("applyEvent: link", () => {
  const msg: Msg = { id: "a", role: "assistant", text: "" }
  it("attaches a same-origin Wealth Lab link", () => {
    const out = applyEvent(msg, { type: "link", label: "Open in Wealth Lab", href: "/wealth?years=20" })
    assert.deepEqual(out.link, { label: "Open in Wealth Lab", href: "/wealth?years=20" })
  })
  it("ignores external, protocol-relative and script links whatever the server sent", () => {
    for (const href of ["https://evil.example/wealth", "//evil.example/wealth", "javascript:alert(1)", "/dashboard", "/wealthx", ""]) {
      assert.equal(applyEvent(msg, { type: "link", label: "x", href }), msg, href)
    }
  })
  it("caps the label length", () => {
    const out = applyEvent(msg, { type: "link", label: "L".repeat(500), href: "/wealth" })
    assert.equal(out.link?.label.length, 60)
  })
})

describe("requestMessages", () => {
  it("drops errored and empty messages and sends only role and content", () => {
    const out = requestMessages([
      m("user", "q1"),
      m("assistant", "partial", { error: "boom" }),
      m("assistant", ""),
      m("user", "q2", { xray: {} as XRay }),
    ])
    assert.deepEqual(out, [{ role: "user", content: "q1" }, { role: "user", content: "q2" }])
  })

  it("sends an answer without its follow-up suggestions", () => {
    const out = requestMessages([m("user", "hi"), m("assistant", "Short answer.\n<follow_ups>\n- More?\n</follow_ups>"), m("user", "more")])
    assert.equal(out[1]!.content, "Short answer.")
  })

  it("does not leak ids, reports or error text to the server", () => {
    const out = requestMessages([m("user", "hi"), m("assistant", "yo", { xray: { secret: 1 } as unknown as XRay })])
    for (const o of out) assert.deepEqual(Object.keys(o).sort(), ["content", "role"])
  })
})

describe("withoutErrors / historyForRetry / patchLastMessage", () => {
  it("withoutErrors removes failed turns", () => {
    assert.deepEqual(withoutErrors([m("user", "a"), m("assistant", "b", { error: "e" })]).map((x) => x.text), ["a"])
  })

  it("retry history ends at the last user message", () => {
    const all = [m("user", "a"), m("assistant", "b"), m("user", "c"), m("assistant", "", { error: "e" })]
    assert.deepEqual(historyForRetry(all)!.map((x) => x.text), ["a", "b", "c"])
  })

  it("retry has nothing to do without a user message", () => {
    assert.equal(historyForRetry([]), null)
    assert.equal(historyForRetry([m("assistant", "x")]), null)
  })

  it("patchLastMessage changes only the last message, and ignores an empty list", () => {
    const all = [m("user", "a"), m("assistant", "b")]
    const out = patchLastMessage(all, (x) => ({ ...x, text: "B" }))
    assert.deepEqual(out.map((x) => x.text), ["a", "B"])
    assert.equal(all[1]!.text, "b")
    assert.deepEqual(patchLastMessage([], (x) => x), [])
  })
})

describe("markStopped", () => {
  it("flags a partial answer as stopped and keeps its text", () => {
    assert.deepEqual(markStopped(m("assistant", "half an ans")), { ...m("assistant", "half an ans"), stopped: true })
  })
  it("leaves failed answers and user messages alone", () => {
    const failed = m("assistant", "x", { error: "boom" })
    assert.equal(markStopped(failed), failed)
    const user = m("user", "q")
    assert.equal(markStopped(user), user)
  })
})

describe("sources", () => {
  it("collects sources, upgrading a mention to a citation, and drops junk", () => {
    let msg = applyEvent(blank, { type: "sources", items: [{ url: "https://a.com/x" }, { url: "javascript:alert(1)" }] })
    msg = applyEvent(msg, { type: "sources", items: [{ url: "http://www.a.com/x/", title: "A", cited: true }] })
    assert.deepEqual(msg.sources, [{ url: "http://www.a.com/x/", title: "A", cited: true }])
  })
})
