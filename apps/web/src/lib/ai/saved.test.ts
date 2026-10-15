import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  MAX_AGE_DAYS, MAX_CONVERSATIONS, MAX_REPORTS, MAX_SAVED_CHARS, MAX_SAVED_MESSAGES,
  addReport, parseConversations, parseReports, recentItems, removeById, titleFor, toSaved, upsertConversation,
  type SavedConversation, type SavedReport,
} from "./saved.ts"
import type { XRay } from "./portfolio-xray.ts"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 15)
const convo = (id: string, ageDays: number): SavedConversation => ({ id, title: id, updatedAt: NOW - ageDays * DAY, messages: [{ role: "user", text: "hi" }] })
const xray = { overview: { totalValue: 100 }, allocation: [], concentration: {}, performance: {}, risks: [], limitations: [] } as unknown as XRay

describe("titleFor", () => {
  it("uses the first user message, collapsed and shortened", () => {
    assert.equal(titleFor([{ role: "assistant", text: "x" }, { role: "user", text: "  How   am\ni doing? " }]), "How am i doing?")
    assert.equal(titleFor([{ role: "user", text: "a".repeat(100) }]).length, 58)
    assert.equal(titleFor([]), "Conversation")
  })
})

describe("toSaved", () => {
  it("keeps text and links only, drops failed turns, empty turns and the X-Ray", () => {
    const out = toSaved([
      { role: "user", text: "q" },
      { role: "assistant", text: "", error: "boom" },
      { role: "assistant", text: "a", link: { label: "Open", href: "/wealth" }, xray } as never,
      { role: "assistant", text: "   " },
    ])
    assert.deepEqual(out, [{ role: "user", text: "q" }, { role: "assistant", text: "a", link: { label: "Open", href: "/wealth" } }])
    assert.ok(!JSON.stringify(out).includes("overview"))
  })
  it("bounds count and length", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ role: "user" as const, text: "x".repeat(10_000) + i }))
    const out = toSaved(many)
    assert.equal(out.length, MAX_SAVED_MESSAGES)
    assert.ok(out.every((m) => m.text.length <= MAX_SAVED_CHARS))
  })
})

describe("upsertConversation", () => {
  it("replaces by id and puts the newest first", () => {
    const out = upsertConversation([convo("a", 2), convo("b", 1)], { ...convo("a", 0), title: "updated" }, NOW)
    assert.deepEqual(out.map((c) => c.id), ["a", "b"])
    assert.equal(out[0]!.title, "updated")
  })
  it("drops conversations older than the retention window", () => {
    const out = upsertConversation([convo("old", MAX_AGE_DAYS + 1), convo("ok", MAX_AGE_DAYS - 1)], convo("new", 0), NOW)
    assert.deepEqual(out.map((c) => c.id), ["new", "ok"])
  })
  it("caps the list", () => {
    const list = Array.from({ length: MAX_CONVERSATIONS + 10 }, (_, i) => convo(`c${i}`, i % 80))
    assert.equal(upsertConversation(list, convo("n", 0), NOW).length, MAX_CONVERSATIONS)
  })
})

describe("reports", () => {
  const r = (id: string, ageDays: number): SavedReport => ({ id, savedAt: NOW - ageDays * DAY, xray })
  it("caps and prunes", () => {
    const list = Array.from({ length: MAX_REPORTS + 5 }, (_, i) => r(`r${i}`, i))
    assert.equal(addReport(list, r("new", 0), NOW).length, MAX_REPORTS)
    assert.deepEqual(addReport([r("old", MAX_AGE_DAYS + 5)], r("new", 0), NOW).map((x) => x.id), ["new"])
  })
  it("removeById removes just that one", () => assert.deepEqual(removeById([r("a", 0), r("b", 0)], "a").map((x) => x.id), ["b"]))
})

describe("recentItems", () => {
  it("interleaves chats and reports by time and limits the list", () => {
    const out = recentItems([convo("c1", 3), convo("c2", 1)], [{ id: "r1", savedAt: NOW - 2 * DAY, xray }], 3)
    assert.deepEqual(out.map((i) => `${i.kind}:${i.id}`), ["chat:c2", "report:r1", "chat:c1"])
    assert.equal(recentItems([convo("a", 1), convo("b", 2)], [], 1).length, 1)
  })
})

describe("parse (untrusted storage)", () => {
  it("drops malformed entries instead of rendering them", () => {
    const out = parseConversations([null, 5, { id: 1 }, { id: "a", title: "t", updatedAt: 1, messages: [{ role: "system", text: "x" }, { role: "user", text: "ok" }, { role: "user" }] }, { id: "b", title: "t", updatedAt: 1, messages: "no" }])
    assert.equal(out.length, 1)
    assert.deepEqual(out[0]!.messages, [{ role: "user", text: "ok" }])
  })
  it("ignores a link that isn't a label and href pair", () => {
    const out = parseConversations([{ id: "a", title: "t", updatedAt: 1, messages: [{ role: "assistant", text: "x", link: { label: 5, href: "/wealth" } }] }])
    assert.equal(out[0]!.messages[0]!.link, undefined)
  })
  it("returns nothing for non-arrays", () => {
    for (const bad of [null, undefined, "x", {}, 3]) {
      assert.deepEqual(parseConversations(bad), [])
      assert.deepEqual(parseReports(bad), [])
    }
  })
  it("keeps only reports with the shape the report view needs", () => {
    const ok = { id: "r", savedAt: 1, xray }
    assert.equal(parseReports([ok, { id: "x", savedAt: 1, xray: {} }, { id: "y", savedAt: "no", xray }, { id: "z", savedAt: 1 }]).length, 1)
  })
})
