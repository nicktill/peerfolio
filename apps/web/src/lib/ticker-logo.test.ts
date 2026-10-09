import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { lookupTickerLogo, parqetLogoUrl } from "./ticker-logo.ts"

const AAPL = parqetLogoUrl("AAPL")

/** Stub fetch answering each URL with a status and content type. */
function stubFetch(answers: Record<string, { status: number; type?: string }>) {
  const calls: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    const answer = answers[url] ?? { status: 404 }
    return new Response(answer.status === 200 ? "<svg></svg>" : null, {
      status: answer.status,
      headers: answer.type ? { "content-type": answer.type } : undefined,
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe("lookupTickerLogo", () => {
  it("asks Parqet with a hyphen for a dotted share class", () => {
    assert.equal(parqetLogoUrl("BRK.B"), "https://assets.parqet.com/logos/symbol/BRK-B")
    assert.equal(parqetLogoUrl("AAPL"), "https://assets.parqet.com/logos/symbol/AAPL")
  })

  it("returns the image when Parqet has one", async () => {
    const { fetchImpl, calls } = stubFetch({ [AAPL]: { status: 200, type: "image/svg+xml" } })
    const logo = await lookupTickerLogo("AAPL", fetchImpl)
    assert.equal(logo.kind, "found")
    assert.deepEqual(calls, [AAPL])
  })

  it("is none when Parqet has no logo", async () => {
    const { fetchImpl } = stubFetch({ [AAPL]: { status: 404 } })
    assert.equal((await lookupTickerLogo("AAPL", fetchImpl)).kind, "none")
  })

  it("is unavailable when the response is not an image", async () => {
    const { fetchImpl } = stubFetch({ [AAPL]: { status: 200, type: "text/html" } })
    assert.equal((await lookupTickerLogo("AAPL", fetchImpl)).kind, "unavailable")
  })

  it("is unavailable when Parqet is down or rate limits", async () => {
    for (const status of [429, 500]) {
      const { fetchImpl } = stubFetch({ [AAPL]: { status } })
      assert.equal((await lookupTickerLogo("AAPL", fetchImpl)).kind, "unavailable")
    }
  })

  it("is unavailable when the request throws", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed")
    }) as typeof fetch
    assert.equal((await lookupTickerLogo("AAPL", fetchImpl)).kind, "unavailable")
  })
})
