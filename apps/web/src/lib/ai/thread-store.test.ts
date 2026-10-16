import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { packThread, threadKey, unpackThread } from "./thread-store.ts"
import type { Msg } from "./chat-state.ts"

const m = (role: Msg["role"], text: string, extra: Partial<Msg> = {}): Msg => ({ id: `${role}-${text}`, role, text, ...extra })
const NOW = 1_800_000_000_000

describe("thread store", () => {
  it("round-trips a conversation and keeps sources", () => {
    const thread = [m("user", "hi"), m("assistant", "hello", { sources: [{ url: "https://a.com/x", cited: true }] })]
    assert.deepEqual(unpackThread(packThread(thread, NOW), NOW + 1000), thread)
  })

  it("keeps the newest twenty and drops errors, empties and reports", () => {
    const many = Array.from({ length: 30 }, (_, i) => m(i % 2 ? "assistant" : "user", `t${i}`))
    const out = unpackThread(packThread([...many, m("assistant", "x", { error: "boom" }), m("assistant", "")], NOW), NOW)
    assert.ok(out.length <= 20)
    assert.equal(out.at(-1)!.text, "t29")
    assert.ok(!JSON.stringify(out).includes("boom"))
  })

  it("forgets a thread after a week, and anything malformed", () => {
    const packed = packThread([m("user", "q"), m("assistant", "a")], NOW)
    assert.equal(unpackThread(packed, NOW + 8 * 86_400_000).length, 0)
    for (const bad of [null, "", "{", "[]", '{"at":"x","messages":[]}', '{"at":1,"messages":5}']) assert.deepEqual(unpackThread(bad, NOW), [])
  })

  it("drops a dangling unanswered question and bad entries", () => {
    const raw = JSON.stringify({ at: NOW, messages: [m("user", "q"), m("assistant", "a"), m("user", "unanswered"), null, { id: 1 }] })
    assert.deepEqual(unpackThread(raw, NOW).map((x) => x.text), ["q", "a"])
  })

  it("keys threads by person", () => {
    assert.notEqual(threadKey("user-a"), threadKey("user-b"))
  })
})
