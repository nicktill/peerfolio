import { test } from "node:test"
import assert from "node:assert/strict"
import { buildEarningsWeek, dayMove, earningsWeekDates, fetchMarketBoard, parseFearGreed, parseQuote, quoteFromSnapshot, tidyCompanyName, weekMove } from "./news-market.ts"

const at = (iso: string) => new Date(iso)
// Tuesday Oct 6 2026, 4:05pm New York.
const close = Date.parse("2026-10-06T20:05:00Z") / 1000

test("parseQuote rejects Finnhub's all-zero answer for an unknown symbol", () => {
  assert.equal(parseQuote({ c: 0, d: null, dp: null, pc: 0, t: 0 }), null)
  assert.deepEqual(parseQuote({ c: 671.2, d: 2.8, dp: 0.42, pc: 668.4, t: close }), { c: 671.2, d: 2.8, dp: 0.42, pc: 668.4, t: close })
})

test("the week runs from the close five sessions back, ignoring today's own bar", () => {
  const quote = { c: 110, d: 1, dp: 0.92, pc: 109, t: close }
  const daily = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"].map((d, i) => ({ t: `${d}T04:00:00Z`, c: 100 + i }))
  // Sessions before Oct 6: ... Sep 29 (101), Sep 30 (102), Oct 1 (103), Oct 2 (104), Oct 5 (105). Five back is Sep 29.
  const week = weekMove(quote, daily)!
  assert.equal(week.percent, 8.91) // 110 / 101
  assert.equal(week.path.length, 6)
  assert.equal(week.path[0], 0)
  assert.equal(weekMove(quote, daily.slice(-3)), null) // not enough history: no number at all
})

test("the day's path starts at the previous close and ends on the quoted move", () => {
  const quote = { c: 101, d: 1, dp: 1, pc: 100, t: close }
  const day = dayMove(quote, [
    { t: "2026-10-05T19:45:00Z", c: 99 }, // yesterday: dropped
    { t: "2026-10-06T13:30:00Z", c: 100.5 },
    { t: "2026-10-06T19:45:00Z", c: 100.9 },
  ])
  assert.deepEqual(day.path, [0, 0.5, 0.9, 1])
  assert.equal(day.percent, 1)
})

test("the earnings week is this week on weekdays and next week from Saturday", () => {
  assert.deepEqual(earningsWeekDates(at("2026-10-06T15:00:00Z")), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"])
  assert.equal(earningsWeekDates(at("2026-10-10T15:00:00Z"))[0], "2026-10-12")
  assert.equal(earningsWeekDates(at("2026-10-11T15:00:00Z"))[0], "2026-10-12")
})

test("earnings days put the biggest companies first and map Finnhub's hours", () => {
  const rows = [
    { date: "2026-10-07", symbol: "SMOL", hour: "amc", epsEstimate: 0.1, revenueEstimate: 5e6 },
    { date: "2026-10-07", symbol: "BIGG", hour: "bmo", epsEstimate: -0.11, revenueEstimate: 9e9 },
    { date: "2026-10-07", symbol: "ODD.X", hour: "", epsEstimate: 1, revenueEstimate: 1e12 }, // not a US ticker
    { date: "2026-10-07", symbol: "MIDD", hour: "", epsEstimate: null, revenueEstimate: 1e8 },
  ]
  const days = buildEarningsWeek(rows, earningsWeekDates(at("2026-10-06T15:00:00Z")), "2026-10-06", new Map([["BIGG", "Big Co"]]))
  const wed = days[2]!
  assert.deepEqual(wed.reports.map((r) => r.symbol), ["BIGG", "MIDD", "SMOL"])
  assert.equal(wed.reports[0]!.when, "before-open")
  assert.equal(wed.reports[0]!.epsEstimate, "−$0.11")
  assert.equal(wed.reports[0]!.name, "Big Co")
  assert.equal(wed.reports[1]!.when, "unknown")
  assert.equal(wed.reports[1]!.epsEstimate, "—")
  assert.equal(days[1]!.today, true)
  assert.equal(days[0]!.past, true)
})

test("Fear & Greed is shown only when it's a recent 0–100 reading", () => {
  const now = at("2026-10-06T21:00:00Z")
  const good = { fear_and_greed: { score: 61.7, rating: "greed", timestamp: "2026-10-06T20:59:00+00:00", previous_close: 58.2, previous_1_week: 49, previous_1_month: 38.4, previous_1_year: 71 } }
  assert.deepEqual(parseFearGreed(good, now), {
    score: 62,
    rating: "greed",
    asOf: "2026-10-06T20:59:00.000Z",
    history: [
      { label: "Previous close", score: 58 },
      { label: "1 week ago", score: 49 },
      { label: "1 month ago", score: 38 },
      { label: "1 year ago", score: 71 },
    ],
  })
  assert.equal(parseFearGreed({ fear_and_greed: { ...good.fear_and_greed, score: 140 } }, now), null)
  assert.equal(parseFearGreed({ fear_and_greed: { ...good.fear_and_greed, timestamp: "2026-09-20T20:00:00Z" } }, now), null)
  assert.equal(parseFearGreed({ unexpected: true }, now), null)
})

test("the market board needs real quotes: no key or no answers means no board", async () => {
  const none = async () => new Response("{}", { status: 500 })
  assert.equal(await fetchMarketBoard({ finnhubKey: undefined, alpaca: null, fetchImpl: none }), null)
  assert.equal(await fetchMarketBoard({ finnhubKey: "k", alpaca: null, fetchImpl: none, now: at("2026-10-06T21:00:00Z") }), null)
})

test("the market board reports each fund's real move and sorts sectors by the day", async () => {
  const dp: Record<string, number> = { SPY: 0.42, QQQ: 0.88, DIA: 0.11, IWM: -0.37, XLK: 1.24, XLE: -1.08 }
  const fetchImpl = async (url: string) => {
    const symbol = new URL(url).searchParams.get("symbol")!
    if (!(symbol in dp)) return new Response(JSON.stringify({ c: 0, d: null, dp: null, pc: 0, t: 0 }))
    return new Response(JSON.stringify({ c: 100 + dp[symbol]!, d: dp[symbol], dp: dp[symbol], pc: 100, t: close }))
  }
  const board = (await fetchMarketBoard({ finnhubKey: "k", alpaca: null, fetchImpl, now: at("2026-10-06T21:00:00Z") }))!
  assert.deepEqual(board.indexes.map((i) => [i.symbol, i.day.percent]), [["SPY", 0.42], ["QQQ", 0.88], ["DIA", 0.11], ["IWM", -0.37]])
  assert.equal(board.indexes[0]!.week, null) // no bars without Alpaca: no made-up week
  assert.deepEqual(board.sectors, [["Technology", 1.24, null], ["Energy", -1.08, null]])
  assert.equal(board.session, "2026-10-06")
})

test("a quote that's days old is treated as missing, not as today's move", async () => {
  const old = Date.parse("2026-09-20T20:00:00Z") / 1000
  const fetchImpl = async () => new Response(JSON.stringify({ c: 101, d: 1, dp: 1, pc: 100, t: old }))
  assert.equal(await fetchMarketBoard({ finnhubKey: "k", alpaca: null, fetchImpl, now: at("2026-10-06T21:00:00Z") }), null)
})

test("calendar rows with no estimates (funds, shells) and repeats are dropped", () => {
  const rows = [
    { date: "2026-10-05", symbol: "NCZ", hour: "", epsEstimate: null, revenueEstimate: null },
    { date: "2026-10-05", symbol: "NCZ", hour: "", epsEstimate: null, revenueEstimate: null },
    { date: "2026-10-05", symbol: "MKC", hour: "bmo", epsEstimate: 0.76, revenueEstimate: 1.7e9 },
    { date: "2026-10-05", symbol: "MKC", hour: "bmo", epsEstimate: 0.76, revenueEstimate: 1.7e9 },
  ]
  const days = buildEarningsWeek(rows, earningsWeekDates(at("2026-10-06T15:00:00Z")), "2026-10-06", new Map())
  assert.deepEqual(days[0]!.reports.map((r) => r.symbol), ["MKC"])
})

test("company names lose the share-class boilerplate", () => {
  assert.equal(tidyCompanyName("Applied Digital Corporation Common Stock"), "Applied Digital Corporation")
  assert.equal(tidyCompanyName("McCormick & Company Inc"), "McCormick & Company")
  assert.equal(tidyCompanyName("VCI Global Limited Ordinary Share"), "VCI Global Limited")
  assert.equal(tidyCompanyName("PepsiCo, Inc."), "PepsiCo")
})

test("an Alpaca snapshot stands in for a missing quote: the session's bar against the one before", () => {
  const q = quoteFromSnapshot({ dailyBar: { t: "2026-10-06T04:00:00Z", c: 101 }, prevDailyBar: { c: 100 } })!
  assert.equal(q.dp, 1)
  assert.equal(q.d, 1)
  assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(q.t * 1000)), "2026-10-06")
  assert.equal(quoteFromSnapshot({ dailyBar: { t: "2026-10-06T04:00:00Z", c: 101 } }), null)
})

const snapshot = (c: number, pc = 100) => ({ dailyBar: { t: "2026-10-06T04:00:00Z", c }, prevDailyBar: { c: pc } })
const snapshotsFor = (url: string, make: (symbol: string) => unknown) => {
  const symbols = new URL(url).searchParams.get("symbols")!.split(",")
  return new Response(JSON.stringify(Object.fromEntries(symbols.map((s) => [s, make(s)]))))
}

test("Alpaca prices every fund in one request and Finnhub isn't asked at all", async () => {
  const urls: string[] = []
  const fetchImpl = async (url: string) => {
    urls.push(url)
    if (url.includes("/snapshots")) return snapshotsFor(url, () => snapshot(99))
    return new Response(JSON.stringify({ bars: {} }))
  }
  const board = (await fetchMarketBoard({ finnhubKey: "k", alpaca: { keyId: "a", secret: "b" }, fetchImpl, now: at("2026-10-06T21:00:00Z") }))!
  assert.equal(urls.filter((u) => u.includes("/snapshots")).length, 1)
  assert.equal(urls.filter((u) => u.includes("finnhub.io")).length, 0)
  assert.equal(board.indexes.length, 4)
  assert.equal(board.sectors.length, 11)
})

test("funds Alpaca didn't answer are filled from Finnhub", async () => {
  const finnhubAsked: string[] = []
  const fetchImpl = async (url: string) => {
    if (url.includes("finnhub.io")) {
      const symbol = new URL(url).searchParams.get("symbol")!
      finnhubAsked.push(symbol)
      return new Response(JSON.stringify({ c: 100.5, d: 0.5, dp: 0.5, pc: 100, t: close }))
    }
    if (url.includes("/snapshots")) return snapshotsFor(url, (s) => (s === "SPY" ? undefined : snapshot(99)))
    return new Response(JSON.stringify({ bars: {} }))
  }
  const board = (await fetchMarketBoard({ finnhubKey: "k", alpaca: { keyId: "a", secret: "b" }, fetchImpl, now: at("2026-10-06T21:00:00Z") }))!
  assert.deepEqual(finnhubAsked, ["SPY"])
  assert.deepEqual(board.indexes.map((i) => [i.symbol, i.day.percent]), [["SPY", 0.5], ["QQQ", -1], ["DIA", -1], ["IWM", -1]])
  assert.equal(board.sectors.length, 11)
})

test("when Alpaca is down, Finnhub fills the whole board", async () => {
  const fetchImpl = async (url: string) => {
    if (url.includes("finnhub.io")) return new Response(JSON.stringify({ c: 100.5, d: 0.5, dp: 0.5, pc: 100, t: close }))
    return new Response("", { status: 503 })
  }
  const board = (await fetchMarketBoard({ finnhubKey: "k", alpaca: { keyId: "a", secret: "b" }, fetchImpl, now: at("2026-10-06T21:00:00Z") }))!
  assert.equal(board.indexes.length, 4)
  assert.equal(board.sectors.length, 11)
})

test("without Alpaca keys the board comes from Finnhub alone", async () => {
  const urls: string[] = []
  const fetchImpl = async (url: string) => {
    urls.push(url)
    return new Response(JSON.stringify({ c: 100.5, d: 0.5, dp: 0.5, pc: 100, t: close }))
  }
  const board = (await fetchMarketBoard({ finnhubKey: "k", alpaca: null, fetchImpl, now: at("2026-10-06T21:00:00Z") }))!
  assert.equal(urls.filter((u) => u.includes("finnhub.io")).length, 15)
  assert.equal(board.indexes.length, 4)
})
