import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createCompositeProvider } from "./composite-provider.ts"
import type { Quote, QuoteProvider, QuoteResult } from "./quote-provider.ts"

const fresh: Quote = { price: 10, asOf: "2026-09-29T19:59:00.000Z" }
const stale: Quote = { price: 9, asOf: "2026-09-29T10:00:00.000Z" }

function fake(name: string, answers: Record<string, Quote>, extra: Partial<QuoteResult> = {}) {
  const asked: string[][] = []
  const provider: QuoteProvider = {
    name,
    async getQuotes(tickers) {
      asked.push(tickers)
      return { quotes: new Map(tickers.filter((t) => answers[t]).map((t) => [t, answers[t]!])), rateLimited: false, failed: 0, ...extra }
    },
  }
  return { provider, asked }
}

const accept = (q: Quote) => q.asOf > "2026-09-29T15:00:00Z"

describe("composite provider", () => {
  it("asks the next source only for what is missing or too old", async () => {
    const first = fake("alpaca", { AAPL: fresh, TLT: stale })
    const second = fake("finnhub", { TLT: { ...fresh, price: 88 }, XYZ: fresh })
    const composite = createCompositeProvider([first.provider, second.provider], accept)

    const out = await composite.getQuotes(["AAPL", "TLT", "XYZ", "NOPE"])

    assert.equal(composite.name, "alpaca+finnhub")
    assert.deepEqual(first.asked, [["AAPL", "TLT", "XYZ", "NOPE"]])
    assert.deepEqual(second.asked, [["TLT", "XYZ", "NOPE"]])
    assert.equal(out.quotes.get("TLT")?.price, 88)
    assert.deepEqual([...out.quotes.keys()].sort(), ["AAPL", "TLT", "XYZ"])
  })

  it("skips later sources when the first covered everything", async () => {
    const first = fake("alpaca", { AAPL: fresh })
    const second = fake("finnhub", {})
    await createCompositeProvider([first.provider, second.provider], accept).getQuotes(["AAPL"])
    assert.equal(second.asked.length, 0)
  })

  it("survives a source that is down or limited, and only reports a limit that left gaps", async () => {
    const limited = fake("alpaca", {}, { rateLimited: true, failed: 1 })
    const backup = fake("finnhub", { AAPL: fresh })
    const filled = await createCompositeProvider([limited.provider, backup.provider], accept).getQuotes(["AAPL"])
    assert.equal(filled.quotes.size, 1)
    assert.equal(filled.rateLimited, false)
    assert.equal(filled.failed, 1)

    const gap = await createCompositeProvider([fake("a", {}, { rateLimited: true }).provider, fake("b", {}).provider], accept).getQuotes(["AAPL"])
    assert.equal(gap.rateLimited, true)
  })
})
