import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { displaySymbol, latestCloses, MarketDataError, previousClose, toMarketTicker } from "./market-data.ts"

/** Stub fetch that answers from a path → body table and records every call. */
function stubFetch(routes: Record<string, unknown>, status = 200) {
  const calls: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    const body = routes[url.pathname] ?? { resultsCount: 0 }
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { fetchImpl, calls }
}

const STOCKS = "/v2/aggs/grouped/locale/us/market/stocks"
const CRYPTO = "/v2/aggs/grouped/locale/global/market/crypto"

beforeEach(() => {
  process.env.MASSIVE_API_KEY = "test-key"
})

describe("toMarketTicker", () => {
  it("uppercases stock and ETF tickers", () => {
    assert.equal(toMarketTicker(" vti ", "stock"), "VTI")
    assert.equal(toMarketTicker("AAPL", "stock"), "AAPL")
  })

  it("normalizes share classes to the provider's dot form", () => {
    assert.equal(toMarketTicker("brk-b", "stock"), "BRK.B")
    assert.equal(toMarketTicker("BRK/B", "stock"), "BRK.B")
    assert.equal(toMarketTicker("BRK.B", "stock"), "BRK.B")
  })

  it("quotes crypto against USD", () => {
    assert.equal(toMarketTicker("btc", "crypto"), "X:BTCUSD")
    assert.equal(toMarketTicker("ETH", "crypto"), "X:ETHUSD")
  })

  it("rejects things that can't be tickers", () => {
    assert.equal(toMarketTicker("", "stock"), null)
    assert.equal(toMarketTicker("AAPL; DROP", "stock"), null)
    assert.equal(toMarketTicker("TOOLONGTICKER", "stock"), null)
    assert.equal(toMarketTicker("X:BTCUSD", "crypto"), null)
  })
})

describe("displaySymbol", () => {
  it("shows crypto as the coin", () => {
    assert.equal(displaySymbol("X:BTCUSD"), "BTC")
    assert.equal(displaySymbol("BRK.B"), "BRK.B")
  })
})

describe("previousClose", () => {
  it("reads the last bar's close and date", async () => {
    const { fetchImpl } = stubFetch({
      "/v2/aggs/ticker/AAPL/prev": { resultsCount: 1, results: [{ T: "AAPL", c: 227.52, t: Date.UTC(2026, 8, 25, 20) }] },
    })
    assert.deepEqual(await previousClose("AAPL", fetchImpl), { price: 227.52, asOf: "2026-09-25" })
  })

  it("returns null for a ticker that doesn't trade", async () => {
    const { fetchImpl } = stubFetch({})
    assert.equal(await previousClose("ZZZZZ", fetchImpl), null)
  })

  it("surfaces rate limiting with its status", async () => {
    const { fetchImpl } = stubFetch({}, 429)
    await assert.rejects(previousClose("AAPL", fetchImpl), (e: unknown) => e instanceof MarketDataError && e.status === 429)
  })

  it("refuses to run without an API key", async () => {
    delete process.env.MASSIVE_API_KEY
    const { fetchImpl, calls } = stubFetch({})
    await assert.rejects(previousClose("AAPL", fetchImpl), MarketDataError)
    assert.equal(calls.length, 0)
  })
})

describe("latestCloses", () => {
  // A Monday: the last stock session was Friday, crypto traded all weekend.
  const monday = new Date(Date.UTC(2026, 8, 28, 6))

  it("walks back over the weekend to the last trading day", async () => {
    const { fetchImpl, calls } = stubFetch({
      [`${STOCKS}/2026-09-25`]: { resultsCount: 2, results: [{ T: "VTI", c: 301.1 }, { T: "MSFT", c: 510 }] },
    })

    const closes = await latestCloses(["VTI"], { now: monday, fetchImpl })

    assert.deepEqual(closes.get("VTI"), { price: 301.1, asOf: "2026-09-25" })
    assert.deepEqual(calls, [`${STOCKS}/2026-09-27`, `${STOCKS}/2026-09-26`, `${STOCKS}/2026-09-25`])
  })

  it("prices crypto from yesterday's bar", async () => {
    const { fetchImpl } = stubFetch({
      [`${CRYPTO}/2026-09-27`]: { resultsCount: 1, results: [{ T: "X:BTCUSD", c: 98000.5 }] },
    })

    const closes = await latestCloses(["X:BTCUSD"], { now: monday, fetchImpl })
    assert.deepEqual(closes.get("X:BTCUSD"), { price: 98000.5, asOf: "2026-09-27" })
  })

  it("only returns tickers that were asked for, and skips ones the market didn't report", async () => {
    const { fetchImpl } = stubFetch({
      [`${STOCKS}/2026-09-25`]: { resultsCount: 2, results: [{ T: "VTI", c: 301.1 }, { T: "MSFT", c: 510 }] },
    })

    const closes = await latestCloses(["VTI", "DELISTED"], { now: monday, fetchImpl })
    assert.deepEqual([...closes.keys()], ["VTI"])
  })

  it("makes one call per market regardless of how many tickers are held", async () => {
    const { fetchImpl, calls } = stubFetch({
      [`${STOCKS}/2026-09-25`]: { resultsCount: 3, results: [{ T: "A", c: 1 }, { T: "B", c: 2 }, { T: "C", c: 3 }] },
      [`${CRYPTO}/2026-09-25`]: { resultsCount: 1, results: [{ T: "X:ETHUSD", c: 4 }] },
    })

    const closes = await latestCloses(["A", "B", "C", "X:ETHUSD"], { now: new Date(Date.UTC(2026, 8, 26, 6)), fetchImpl })
    assert.equal(closes.size, 4)
    assert.deepEqual(calls, [`${STOCKS}/2026-09-25`, `${CRYPTO}/2026-09-25`])
  })

  it("makes no calls when nothing is held", async () => {
    const { fetchImpl, calls } = stubFetch({})
    assert.equal((await latestCloses([], { fetchImpl })).size, 0)
    assert.equal(calls.length, 0)
  })
})
