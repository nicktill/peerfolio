import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { tiingoApiKey, tiingoFundCloses } from "./tiingo.ts"

function stub(reply: (ticker: string) => { status?: number; body?: unknown } | "throw") {
  const requests: { url: URL; headers: Headers }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    requests.push({ url, headers: new Headers(init?.headers) })
    const ticker = decodeURIComponent(url.pathname.split("/")[3] ?? "")
    const r = reply(ticker)
    if (r === "throw") throw new Error("down")
    return new Response(JSON.stringify(r.body ?? []), { status: r.status ?? 200 })
  }) as typeof fetch
  return { fetchImpl, requests }
}

const bar = (close: number) => ({ status: 200, body: [{ date: "2026-09-29T00:00:00.000Z", close, adjClose: close }] })

describe("tiingo fund closes", () => {
  it("reads the latest close and its date, with the key in a header", async () => {
    const { fetchImpl, requests } = stub((t) => (t === "FXAIX" ? bar(201.5) : bar(20.1)))
    const out = await tiingoFundCloses(["FXAIX", "FZROX"], { apiKey: "secret-key", fetchImpl })
    assert.deepEqual(out.closes.get("FXAIX"), { price: 201.5, asOf: "2026-09-29" })
    assert.equal(out.closes.get("FZROX")?.price, 20.1)
    assert.equal(requests[0]!.headers.get("authorization"), "Token secret-key")
    assert.equal(requests[0]!.url.toString().includes("secret-key"), false)
  })

  it("separates unknown tickers from failures, and stops on the hourly limit", async () => {
    const { fetchImpl } = stub((t) => (t === "NOPE" ? { status: 404 } : t === "BOOM" ? "throw" : t === "SLOW" ? { status: 429 } : bar(1)))
    const out = await tiingoFundCloses(["NOPE", "BOOM", "SLOW", "AFTER"], { apiKey: "k", fetchImpl })
    assert.deepEqual([...out.unknown], ["NOPE"])
    assert.equal(out.failed, 1)
    assert.equal(out.rateLimited, true)
    assert.equal(out.closes.has("AFTER"), false)
  })

  it("treats an empty answer as unknown and skips malformed symbols", async () => {
    const { fetchImpl, requests } = stub(() => ({ status: 200, body: [] }))
    const out = await tiingoFundCloses(["FXAIX", "not a ticker!"], { apiKey: "k", fetchImpl })
    assert.deepEqual([...out.unknown], ["FXAIX"])
    assert.equal(requests.length, 1)
  })
})


it("accepts the deployed key spelling and prefers the canonical key", () => {
  assert.equal(tiingoApiKey({ TTINGO_API_KEY: "legacy" }), "legacy")
  assert.equal(tiingoApiKey({ TIINGO_API_KEY: "canonical", TTINGO_API_KEY: "legacy" }), "canonical")
  assert.equal(tiingoApiKey({ TIINGO_API_KEY: " ", TTINGO_API_KEY: " legacy " }), "legacy")
  assert.equal(tiingoApiKey({}), undefined)
})
