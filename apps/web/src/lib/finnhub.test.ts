import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createFinnhubProvider } from "./finnhub.ts"

type Reply = { status?: number; body?: unknown } | "throw"

/** Stub fetch that answers per symbol and records every request. */
function stub(replies: Record<string, Reply>) {
  const requests: { symbol: string; headers: Headers; url: string }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const symbol = url.searchParams.get("symbol") ?? ""
    requests.push({ symbol, headers: new Headers(init?.headers), url: url.toString() })
    const reply = replies[symbol] ?? { status: 200, body: { c: 0, t: 0 } }
    if (reply === "throw") throw new Error("network down")
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 })
  }) as typeof fetch
  return { fetchImpl, requests }
}

const T = 1_790_702_000 // unix seconds
const ok = (c: number) => ({ status: 200, body: { c, t: T } })

describe("finnhub provider", () => {
  it("returns prices with the time of the last trade", async () => {
    const { fetchImpl } = stub({ AAPL: ok(338.4), NVDA: ok(228.86) })
    const result = await createFinnhubProvider({ apiKey: "k", fetchImpl }).getQuotes(["AAPL", "NVDA"])

    assert.deepEqual(result.quotes.get("AAPL"), { price: 338.4, asOf: new Date(T * 1000).toISOString() })
    assert.equal(result.quotes.get("NVDA")?.price, 228.86)
    assert.equal(result.rateLimited, false)
    assert.equal(result.failed, 0)
  })

  it("sends the key in a header, never in the URL", async () => {
    const { fetchImpl, requests } = stub({ AAPL: ok(1) })
    await createFinnhubProvider({ apiKey: "secret-key", fetchImpl }).getQuotes(["AAPL"])

    assert.equal(requests[0]!.headers.get("x-finnhub-token"), "secret-key")
    assert.equal(requests[0]!.url.includes("secret-key"), false)
  })

  it("treats Finnhub's all-zeros answer for an unknown ticker as 'no price'", async () => {
    const { fetchImpl } = stub({ ZZZZ: { status: 200, body: { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 } } })
    const result = await createFinnhubProvider({ apiKey: "k", fetchImpl }).getQuotes(["ZZZZ"])
    assert.equal(result.quotes.size, 0)
    assert.equal(result.failed, 0)
  })

  it("stops at the first 429 instead of burning the next minute's budget", async () => {
    const { fetchImpl, requests } = stub({ A: ok(1), B: { status: 429 }, C: ok(3), D: ok(4), E: ok(5) })
    const result = await createFinnhubProvider({ apiKey: "k", fetchImpl, concurrency: 1 }).getQuotes(["A", "B", "C", "D", "E"])

    assert.equal(result.rateLimited, true)
    assert.deepEqual([...result.quotes.keys()], ["A"], "keeps what it had before the limit")
    assert.deepEqual(requests.map((r) => r.symbol), ["A", "B"], "C, D and E were never requested")
  })

  it("counts other failures without stopping", async () => {
    const { fetchImpl } = stub({ A: { status: 500 }, B: "throw", C: ok(3) })
    const result = await createFinnhubProvider({ apiKey: "k", fetchImpl, concurrency: 1 }).getQuotes(["A", "B", "C"])

    assert.equal(result.failed, 2)
    assert.equal(result.quotes.get("C")?.price, 3)
    assert.equal(result.rateLimited, false)
  })

  it("skips crypto, malformed symbols and duplicates without spending a call", async () => {
    const { fetchImpl, requests } = stub({ AAPL: ok(1), "BRK.B": ok(2) })
    const result = await createFinnhubProvider({ apiKey: "k", fetchImpl }).getQuotes(["AAPL", "AAPL", "X:BTCUSD", "bad symbol", "", "BRK.B"])

    assert.deepEqual(requests.map((r) => r.symbol).sort(), ["AAPL", "BRK.B"])
    assert.equal(result.quotes.size, 2)
  })

  it("ignores malformed bodies", async () => {
    const { fetchImpl } = stub({ A: { status: 200, body: { c: "228.86", t: T } }, B: { status: 200, body: { c: 5 } }, C: { status: 200, body: {} } })
    const result = await createFinnhubProvider({ apiKey: "k", fetchImpl }).getQuotes(["A", "B", "C"])
    assert.equal(result.quotes.size, 0)
  })

  it("makes no calls for an empty list", async () => {
    const { fetchImpl, requests } = stub({})
    const result = await createFinnhubProvider({ apiKey: "k", fetchImpl }).getQuotes([])
    assert.equal(requests.length, 0)
    assert.equal(result.quotes.size, 0)
  })
})
