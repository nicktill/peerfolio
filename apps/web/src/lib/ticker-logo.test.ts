import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { lookupTickerLogo } from "./ticker-logo.ts"

const DETAILS = "https://api.massive.com/v3/reference/tickers/AAPL"
const ICON = "https://x/icon.png"

/** Stub fetch answering each URL with a status (and JSON body for the details). */
function stubFetch(answers: Record<string, { status: number; body?: unknown }>) {
  const calls: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    const answer = Object.entries(answers).find(([prefix]) => url.startsWith(prefix))?.[1] ?? { status: 404 }
    return new Response(answer.body === undefined ? "png" : JSON.stringify(answer.body), { status: answer.status })
  }) as typeof fetch
  return { fetchImpl, calls }
}

const withIcon = { status: 200, body: { results: { name: "Apple Inc.", branding: { icon_url: ICON } } } }

describe("lookupTickerLogo", () => {
  beforeEach(() => {
    process.env.MASSIVE_API_KEY = "test"
  })

  it("returns the image when Massive has one", async () => {
    const { fetchImpl, calls } = stubFetch({ [DETAILS]: withIcon, [ICON]: { status: 200 } })
    const logo = await lookupTickerLogo("AAPL", "test", fetchImpl)
    assert.equal(logo.kind, "found")
    assert.deepEqual(calls, [DETAILS, ICON])
  })

  it("is none when the ticker is unknown or has no branding", async () => {
    assert.equal((await lookupTickerLogo("AAPL", "test", stubFetch({ [DETAILS]: { status: 404 } }).fetchImpl)).kind, "none")
    const bare = stubFetch({ [DETAILS]: { status: 200, body: { results: { name: "Apple Inc." } } } })
    assert.equal((await lookupTickerLogo("AAPL", "test", bare.fetchImpl)).kind, "none")
  })

  it("is none when the image itself is gone", async () => {
    const { fetchImpl } = stubFetch({ [DETAILS]: withIcon, [ICON]: { status: 404 } })
    assert.equal((await lookupTickerLogo("AAPL", "test", fetchImpl)).kind, "none")
  })

  it("is unavailable, not none, when the details request is refused for budget", async () => {
    const { fetchImpl } = stubFetch({ [DETAILS]: { status: 429, body: { error: "spent" } } })
    assert.equal((await lookupTickerLogo("AAPL", "test", fetchImpl)).kind, "unavailable")
  })

  it("is unavailable when the image request is refused or fails", async () => {
    for (const status of [429, 500]) {
      const { fetchImpl } = stubFetch({ [DETAILS]: withIcon, [ICON]: { status } })
      assert.equal((await lookupTickerLogo("AAPL", "test", fetchImpl)).kind, "unavailable")
    }
  })

  it("is unavailable when the request throws", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed")
    }) as typeof fetch
    assert.equal((await lookupTickerLogo("AAPL", "test", fetchImpl)).kind, "unavailable")
  })
})
