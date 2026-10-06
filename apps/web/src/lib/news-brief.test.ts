import { test } from "node:test"
import assert from "node:assert/strict"
import { checkBrief, fallbackBrief, figures, isLastSessionOfWeek, selectItems, writeBrief, type Brief, type BriefItem } from "./news-brief.ts"

const at = (iso: string) => new Date(iso)
const raw = [
  { source: "CNBC", title: "S&P 500 rises 0.4% as chipmakers rally", url: "https://x/1", summary: "Nvidia gained 2.3%.", publishedAt: at("2026-10-06T20:10:00Z") },
  { source: "MarketWatch", title: "Treasury yields steady near 4.1%", url: "https://x/2", summary: null, publishedAt: at("2026-10-06T19:00:00Z") },
  { source: "Yahoo Finance", title: "S&P 500 rises 0.4% as chipmakers rally!", url: "https://x/3", summary: null, publishedAt: at("2026-10-06T18:00:00Z") },
  { source: "Nasdaq", title: "Oil slips, energy shares lag", url: "https://x/4", summary: null, publishedAt: at("2026-10-06T17:00:00Z") },
  { source: "CNBC", title: "PepsiCo to report Thursday", url: "https://x/5", summary: null, publishedAt: at("2026-10-06T16:00:00Z") },
  { source: "CNBC", title: "Old story", url: "https://x/6", summary: null, publishedAt: at("2026-10-01T16:00:00Z") },
]
const window = { from: at("2026-10-05T22:00:00Z"), to: at("2026-10-06T23:00:00Z"), max: 60 }

test("selectItems keeps the window, drops near-duplicates, numbers newest first", () => {
  const items = selectItems(raw, window)
  assert.deepEqual(items.map((i) => i.id), ["s1", "s2", "s3", "s4"])
  assert.equal(items[0]!.url, "https://x/1")
  assert.ok(!items.some((i) => i.title === "Old story"))
})

const good: Brief = {
  headline: "Chipmakers lift the S&P 500 0.4% as yields hold steady",
  body: "Stocks rose as chipmakers rallied, with Nvidia up 2.3%. Treasury yields held near 4.1%, while oil slipped and energy shares lagged.",
  takeaways: [
    { title: "Chips led", body: "Nvidia gained 2.3% as chipmakers rallied.", sourceIds: ["s1"] },
    { title: "Rates calm", body: "Treasury yields were steady near 4.1%.", sourceIds: ["s2"] },
    { title: "Energy lagged", body: "Oil slipped and energy shares trailed.", sourceIds: ["s3"] },
  ],
  sourceIds: ["s1", "s2", "s3"],
}

test("a sourced draft passes", () => {
  assert.deepEqual(checkBrief(good, selectItems(raw, window), "2026-10-06"), [])
})

test("numbers that aren't in the items are rejected", () => {
  const bad = { ...good, body: good.body.replace("2.3%", "3.1%") }
  const problems = checkBrief(bad, selectItems(raw, window), "2026-10-06")
  assert.ok(problems.some((p) => p.includes("3.1")), problems.join(" | "))
})

test("unknown source ids and wrong takeaway counts are rejected", () => {
  const bad = { ...good, takeaways: good.takeaways.slice(0, 2), sourceIds: ["s9"] }
  const problems = checkBrief(bad, selectItems(raw, window), "2026-10-06")
  assert.ok(problems.some((p) => p.includes("exactly 3")))
  assert.ok(problems.some((p) => p.includes("s9")))
})

test("figures normalises thousands separators and ignores single digits", () => {
  assert.deepEqual(figures("Up 1,250 points, 3 takeaways, 0.4%"), ["1250", "0.4"])
})

function fakeClient(drafts: unknown[]) {
  let call = 0
  return {
    calls: () => call,
    responses: {
      create: async () => ({ output_text: JSON.stringify(drafts[call++]), usage: { input_tokens: 4000, output_tokens: 1000 } }),
    },
  }
}

test("writeBrief retries once with feedback, then uses a passing draft", async () => {
  const items = selectItems(raw, window)
  const client = fakeClient([{ ...good, body: "Stocks soared 9.9%." }, good])
  const result = await writeBrief({ client: client as never, period: "day", sessionDate: "2026-10-06", items })
  assert.equal(result.fallback, false)
  assert.equal(client.calls(), 2)
  assert.equal(result.inputTokens, 8000)
  assert.ok(result.costUsd > 0 && result.costUsd < 0.01)
})

test("writeBrief falls back to the headlines when both drafts fail", async () => {
  const items = selectItems(raw, window)
  const bad = { ...good, headline: "Stocks soared 9.9%" }
  const result = await writeBrief({ client: fakeClient([bad, bad]) as never, period: "day", sessionDate: "2026-10-06", items })
  assert.equal(result.fallback, true)
  assert.equal(result.brief.headline, items[0]!.title)
})

test("writeBrief without a client uses the fallback and spends nothing", async () => {
  const result = await writeBrief({ client: null, period: "day", sessionDate: "2026-10-06", items: selectItems(raw, window) })
  assert.equal(result.fallback, true)
  assert.equal(result.costUsd, 0)
})

test("fallbackBrief cites what it uses", () => {
  const items: BriefItem[] = selectItems(raw, window)
  const brief = fallbackBrief(items)
  assert.equal(brief.sourceIds[0], "s1")
})

test("isLastSessionOfWeek handles Fridays and holiday Fridays", () => {
  const sessions = new Set(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-04-02"])
  const isSession = (d: string) => sessions.has(d)
  assert.equal(isLastSessionOfWeek("2026-10-09", isSession), true)
  assert.equal(isLastSessionOfWeek("2026-10-08", isSession), false)
  // Good Friday 2026-04-03 is a holiday, so Thursday closes the week.
  assert.equal(isLastSessionOfWeek("2026-04-02", isSession), true)
})
