import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildDashboard, summarize, symbolCount, type StatRow } from "./provider-stats-core.ts"

const row = (provider: string, minute: string, requests: number, extra: Partial<StatRow> = {}): StatRow => ({
  provider, minute: new Date(minute), requests, symbols: requests, denied: 0, rateLimited: 0, failed: 0, ...extra,
})

describe("symbolCount", () => {
  it("counts the symbols parameter, else one", () => {
    assert.equal(symbolCount("https://x.test/v2/stocks/snapshots?symbols=AAPL%2CMSFT%2CTSLA&feed=iex"), 3)
    assert.equal(symbolCount(new URL("https://finnhub.io/api/v1/quote?symbol=AAPL")), 1)
    assert.equal(symbolCount("not a url"), 1)
  })
})

describe("summarize", () => {
  const now = new Date("2026-10-13T15:30:00Z")
  const rows = [
    row("alpaca", "2026-10-13T15:10:00Z", 4, { symbols: 400, denied: 1 }),
    row("alpaca", "2026-10-13T15:20:00Z", 9, { symbols: 900, rateLimited: 2, failed: 1 }),
    row("alpaca", "2026-10-13T13:00:00Z", 50), // earlier today, outside the hour
    row("alpaca", "2026-10-10T14:00:00Z", 3),
    row("alpaca", "2026-09-01T14:00:00Z", 99), // outside the window
    row("finnhub", "2026-10-12T14:00:00Z", 7),
  ]
  const [alpaca, finnhub] = summarize(rows, { now, hourlyBudgets: { alpaca: 9000 } })

  it("sums per day over seven days, zero-filling quiet ones", () => {
    assert.equal(alpaca!.days.length, 7)
    assert.equal(alpaca!.days.at(-1)!.date, "2026-10-13")
    assert.equal(alpaca!.days.at(-1)!.requests, 63)
    assert.equal(alpaca!.days.at(-1)!.symbols, 400 + 900 + 50)
    assert.equal(alpaca!.days.find((d) => d.date === "2026-10-11")!.requests, 0)
    assert.equal(alpaca!.totals.requests, 66)
  })

  it("finds the peak minute", () => {
    assert.deepEqual(alpaca!.peak, { requests: 50, minute: "2026-10-13T13:00:00.000Z" })
  })

  it("counts the last hour against the budget, with denials and rate limits", () => {
    assert.deepEqual(alpaca!.currentHour, { requests: 13, denied: 1, budget: 9000 })
    assert.equal(alpaca!.totals.rateLimited, 2)
    assert.equal(alpaca!.totals.failed, 1)
  })

  it("keeps providers apart", () => {
    assert.equal(finnhub!.provider, "finnhub")
    assert.equal(finnhub!.currentHour.budget, null)
    assert.equal(finnhub!.totals.requests, 7)
  })
})

describe("buildDashboard", () => {
  const now = new Date("2026-10-13T15:30:30Z")
  const rows = [
    row("alpaca", "2026-10-13T15:10:00Z", 170, { symbols: 17000, denied: 2 }),
    row("alpaca", "2026-10-13T15:11:00Z", 20),
    row("alpaca", "2026-10-12T14:00:00Z", 30, { rateLimited: 1 }),
    row("tiingo", "2026-10-13T14:05:00Z", 30),
    row("tiingo", "2026-10-13T14:40:00Z", 15),
    row("massive", "2026-10-13T15:00:00Z", 2),
  ]
  const d = buildDashboard(rows, { now, range: "6h", hourlyBudgets: { alpaca: 9000 } })
  const get = (p: string) => d.providers.find((x) => x.provider === p)!

  it("lists every known provider, with data flagged", () => {
    assert.equal(d.hasData, true)
    assert.deepEqual(d.providers.map((p) => p.provider).sort(), ["alpaca", "finnhub", "massive", "tiingo"])
    assert.equal(buildDashboard([], { now }).hasData, false)
  })

  it("measures the peak against the real limit and warns above 80%", () => {
    assert.deepEqual(get("alpaca").peak, { value: 170, at: "2026-10-13T15:10:00.000Z" })
    assert.equal(get("alpaca").warn, true) // 170/200 = 85%
    assert.equal(get("massive").warn, false) // 2/5
    assert.equal(get("finnhub").peak.value, 0)
  })

  it("sums hourly-limit providers per clock hour", () => {
    assert.equal(get("tiingo").peak.value, 45)
    assert.equal(get("tiingo").peakRatio, 45 / 50)
    assert.equal(get("tiingo").warn, true)
  })

  it("buckets the series and keeps today and the last hour independent of the range", () => {
    const alpaca = get("alpaca")
    const point = alpaca.series.find((s) => s.t === "2026-10-13T15:10:00.000Z")!
    assert.deepEqual([point.value, point.requests, point.symbols], [170, 190, 17000 + 20])
    assert.equal(alpaca.today.requests, 190)
    assert.deepEqual(alpaca.lastHour, { requests: 190, denied: 2 })
    assert.equal(alpaca.lastHourRatio, 190 / 9000)
    assert.equal(alpaca.totals.requests, 190) // yesterday's row is outside 6h
    assert.equal(alpaca.days.length, 7)
    assert.equal(alpaca.days.at(-2)!.rateLimited, 1)
  })
})
