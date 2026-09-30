import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { displaySymbol, isNewerClose, latestCloses, MarketDataError, previousClose, searchTickers, securityTypeFromTickerType, tickerDetails, toMarketTicker } from "./market-data.ts"

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

describe("isNewerClose", () => {
  it("accepts newer or equal dates and rejects older ones", () => {
    assert.equal(isNewerClose("2026-09-29", "2026-09-28"), true)
    assert.equal(isNewerClose("2026-09-28", "2026-09-28"), true)
    assert.equal(isNewerClose("2026-09-25", "2026-09-28"), false)
  })

  it("accepts anything when nothing is stored, and ignores time-of-day suffixes", () => {
    assert.equal(isNewerClose("2026-09-25", null), true)
    assert.equal(isNewerClose("2026-09-25", undefined), true)
    assert.equal(isNewerClose("2026-09-28", "2026-09-28T00:00:00.000Z"), true)
    assert.equal(isNewerClose("2026-09-27", "2026-09-28T00:00:00.000Z"), false)
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

  it("uses today's stock bar once the US session is over, so the nightly run isn't a day stale", async () => {
    const tuesdayNight = new Date(Date.UTC(2026, 8, 29, 22, 30))
    const { fetchImpl, calls } = stubFetch({
      [`${STOCKS}/2026-09-29`]: { resultsCount: 1, results: [{ T: "VTI", c: 305 }] },
      [`${STOCKS}/2026-09-28`]: { resultsCount: 1, results: [{ T: "VTI", c: 301 }] },
    })

    const closes = await latestCloses(["VTI"], { now: tuesdayNight, fetchImpl })

    assert.deepEqual(closes.get("VTI"), { price: 305, asOf: "2026-09-29" })
    assert.deepEqual(calls, [`${STOCKS}/2026-09-29`])
  })

  it("does not take a partial intraday stock bar before the close", async () => {
    const tuesdayMidday = new Date(Date.UTC(2026, 8, 29, 17, 0))
    const { fetchImpl, calls } = stubFetch({
      [`${STOCKS}/2026-09-29`]: { resultsCount: 1, results: [{ T: "VTI", c: 999 }] },
      [`${STOCKS}/2026-09-28`]: { resultsCount: 1, results: [{ T: "VTI", c: 301 }] },
    })

    const closes = await latestCloses(["VTI"], { now: tuesdayMidday, fetchImpl })

    assert.equal(closes.get("VTI")?.price, 301)
    assert.deepEqual(calls, [`${STOCKS}/2026-09-28`])
  })

  it("falls back a day when the provider withholds today's bar", async () => {
    const tuesdayNight = new Date(Date.UTC(2026, 8, 29, 22, 30))
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      calls.push(path)
      if (path === `${STOCKS}/2026-09-29`) return new Response("{}", { status: 403 })
      return new Response(JSON.stringify({ results: [{ T: "VTI", c: 301 }] }), { status: 200 })
    }) as typeof fetch

    const closes = await latestCloses(["VTI"], { now: tuesdayNight, fetchImpl })

    assert.deepEqual(closes.get("VTI"), { price: 301, asOf: "2026-09-28" })
    assert.deepEqual(calls, [`${STOCKS}/2026-09-29`, `${STOCKS}/2026-09-28`])
  })

  it("also falls back when yesterday's bar is withheld after midnight UTC", async () => {
    const wednesdayEarly = new Date(Date.UTC(2026, 8, 30, 0, 36))
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      calls.push(path)
      if (path === `${STOCKS}/2026-09-29`) return new Response("{}", { status: 403 })
      return new Response(JSON.stringify({ results: [{ T: "VTI", c: 301 }] }), { status: 200 })
    }) as typeof fetch

    const closes = await latestCloses(["VTI"], { now: wednesdayEarly, fetchImpl })

    assert.deepEqual(closes.get("VTI"), { price: 301, asOf: "2026-09-28" })
  })

  it("still surfaces a real outage on a finished day", async () => {
    const { fetchImpl } = stubFetch({}, 500)
    await assert.rejects(latestCloses(["VTI"], { now: monday, fetchImpl }), MarketDataError)
  })

  it("never uses today's crypto bar, which is still forming", async () => {
    const tuesdayNight = new Date(Date.UTC(2026, 8, 29, 22, 30))
    const { fetchImpl, calls } = stubFetch({
      [`${CRYPTO}/2026-09-28`]: { resultsCount: 1, results: [{ T: "X:BTCUSD", c: 98000 }] },
    })

    await latestCloses(["X:BTCUSD"], { now: tuesdayNight, fetchImpl })
    assert.deepEqual(calls, [`${CRYPTO}/2026-09-28`])
  })

  it("makes no calls when nothing is held", async () => {
    const { fetchImpl, calls } = stubFetch({})
    assert.equal((await latestCloses([], { fetchImpl })).size, 0)
    assert.equal(calls.length, 0)
  })
})

describe("tickerDetails", () => {
  beforeEach(() => {
    process.env.MASSIVE_API_KEY = "test"
  })

  it("returns the name and branding", async () => {
    const { fetchImpl } = stubFetch({
      "/v3/reference/tickers/AAPL": { results: { name: "Apple Inc.", branding: { icon_url: "https://x/icon.png", logo_url: "https://x/logo.svg" } } },
    })
    assert.deepEqual(await tickerDetails("AAPL", fetchImpl), { name: "Apple Inc.", securityType: null, iconUrl: "https://x/icon.png", logoUrl: "https://x/logo.svg" })
  })

  it("returns null for a ticker the provider doesn't know", async () => {
    const { fetchImpl } = stubFetch({}, 404)
    assert.equal(await tickerDetails("APPL", fetchImpl), null)
  })
})

describe("searchTickers", () => {
  beforeEach(() => {
    process.env.MASSIVE_API_KEY = "test"
  })

  it("maps matches to display symbols", async () => {
    const { fetchImpl } = stubFetch({
      "/v3/reference/tickers": { results: [{ ticker: "AAPL", name: "Apple Inc." }, { ticker: "X:BTCUSD" }] },
    })
    assert.deepEqual(await searchTickers("APPL", "stock", { fetchImpl }), [{ symbol: "AAPL", name: "Apple Inc." }])
  })
})


describe("instrument classification", () => {
  it("uses the provider type rather than a fund-like name", () => {
    assert.equal(securityTypeFromTickerType("ETF"), "etf")
    assert.equal(securityTypeFromTickerType("CS"), "equity")
    for (const type of [undefined, "ETN", "ETV", "FUND", "unknown"]) assert.equal(securityTypeFromTickerType(type), null)
  })
  it("preserves ETF metadata even without branding", async () => {
    process.env.MASSIVE_API_KEY = "test"
    const result = await tickerDetails("VOO", async () => new Response(JSON.stringify({ results: { name: "Vanguard S&P 500 ETF", type: "ETF" } })))
    assert.equal(result?.securityType, "etf")
    assert.equal(result?.iconUrl, null)
  })
})
