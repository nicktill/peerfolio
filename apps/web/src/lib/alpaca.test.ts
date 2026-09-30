import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createAlpacaProvider } from "./alpaca.ts"

const trade = (p: number, t = "2026-09-29T19:59:58.123456789Z") => ({ latestTrade: { p, t, s: 100 } })

function stub(reply: (url: URL) => { status?: number; body?: unknown } | "throw") {
  const requests: { url: URL; headers: Headers }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    requests.push({ url, headers: new Headers(init?.headers) })
    const r = reply(url)
    if (r === "throw") throw new Error("down")
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 })
  }) as typeof fetch
  return { fetchImpl, requests }
}

describe("alpaca provider", () => {
  it("prices many tickers in one request and trims nanosecond timestamps", async () => {
    const { fetchImpl, requests } = stub(() => ({ body: { AAPL: trade(329.4), NVDA: trade(227.21) } }))
    const out = await createAlpacaProvider({ keyId: "id", secret: "sec", fetchImpl }).getQuotes(["AAPL", "NVDA", "X:BTCUSD"])

    assert.equal(requests.length, 1)
    assert.equal(requests[0]!.url.searchParams.get("symbols"), "AAPL,NVDA")
    assert.equal(requests[0]!.url.searchParams.get("feed"), "iex")
    assert.deepEqual(out.quotes.get("AAPL"), { price: 329.4, asOf: "2026-09-29T19:59:58.123Z" })
    assert.equal(out.quotes.size, 2)
    assert.equal(out.rateLimited, false)
  })

  it("sends the keys in headers, never in the URL", async () => {
    const { fetchImpl, requests } = stub(() => ({ body: {} }))
    await createAlpacaProvider({ keyId: "the-id", secret: "the-secret", fetchImpl }).getQuotes(["AAPL"])
    assert.equal(requests[0]!.headers.get("apca-api-key-id"), "the-id")
    assert.equal(requests[0]!.headers.get("apca-api-secret-key"), "the-secret")
    assert.equal(requests[0]!.url.toString().includes("the-secret"), false)
  })

  it("reads the older wrapped shape, and skips symbols with no trade", async () => {
    const { fetchImpl } = stub(() => ({ body: { snapshots: { AAPL: trade(1), MSFT: {}, TSLA: { latestTrade: { p: 0, t: "2026-09-29T19:00:00Z" } } } } }))
    const out = await createAlpacaProvider({ keyId: "i", secret: "s", fetchImpl }).getQuotes(["AAPL", "MSFT", "TSLA"])
    assert.deepEqual([...out.quotes.keys()], ["AAPL"])
  })

  it("splits big lists into several requests", async () => {
    const symbols = Array.from({ length: 230 }, (_, i) => `A${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`)
    const { fetchImpl, requests } = stub(() => ({ body: {} }))
    await createAlpacaProvider({ keyId: "i", secret: "s", fetchImpl }).getQuotes(symbols)
    assert.equal(requests.length, 3)
  })

  it("stops on a rate limit and counts other failures", async () => {
    const limited = stub(() => ({ status: 429 }))
    const a = await createAlpacaProvider({ keyId: "i", secret: "s", fetchImpl: limited.fetchImpl }).getQuotes(["AAPL"])
    assert.equal(a.rateLimited, true)

    const broken = stub(() => "throw")
    const b = await createAlpacaProvider({ keyId: "i", secret: "s", fetchImpl: broken.fetchImpl }).getQuotes(["AAPL"])
    assert.equal(b.failed, 1)

    const denied = stub(() => ({ status: 403, body: { message: "forbidden" } }))
    const c = await createAlpacaProvider({ keyId: "i", secret: "s", fetchImpl: denied.fetchImpl }).getQuotes(["AAPL"])
    assert.equal(c.failed, 1)
    assert.equal(c.quotes.size, 0)
  })
})
