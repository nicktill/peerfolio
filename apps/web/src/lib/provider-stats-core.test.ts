import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildDashboard,
  buildEvent,
  classifyError,
  createEventLimiter,
  endpointOf,
  groupReasons,
  reasonFromBody,
  summarize,
  symbolCount,
  symbolsSampleOf,
  type StatRow,
} from "./provider-stats-core.ts"

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

describe("event fields", () => {
  it("keeps the path and drops the query, so keys in a URL never reach the log", () => {
    assert.equal(endpointOf("https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL&apikey=SECRET123"), "/v2/stocks/snapshots")
    assert.equal(endpointOf(new URL("https://finnhub.io/api/v1/quote?symbol=AAPL&token=abc")), "/api/v1/quote")
    assert.equal(endpointOf("nonsense"), "(unknown)")
    assert.equal(endpointOf(`https://x.test/v1/${"a".repeat(40)}/prices`), "/v1/:id/prices")
  })

  it("samples up to five tickers from the query or the path", () => {
    assert.deepEqual(symbolsSampleOf("https://x.test/v2/stocks/snapshots?symbols=aapl,MSFT,BRK.B,A,B,C,D"), ["AAPL", "MSFT", "BRK.B", "A", "B"])
    assert.deepEqual(symbolsSampleOf("https://finnhub.io/api/v1/quote?symbol=VTSAX"), ["VTSAX"])
    assert.deepEqual(symbolsSampleOf("https://api.massive.com/v2/aggs/ticker/AAPL/prev?adjusted=true"), ["AAPL"])
    assert.deepEqual(symbolsSampleOf("https://api.massive.com/v3/reference/tickers?search=apple%20inc"), [])
    assert.deepEqual(symbolsSampleOf("https://x.test/q?symbols=%E0%A4%A,<script>"), [])
  })

  it("reads a reason from a JSON message or plain text, truncated and scrubbed", () => {
    assert.equal(reasonFromBody('{"error":"Invalid API key"}'), "Invalid API key")
    assert.equal(reasonFromBody('{"message":"forbidden","status":"ERROR"}'), "forbidden")
    assert.equal(reasonFromBody('{"error":{"message":"bad symbol"}}'), "bad symbol")
    assert.equal(reasonFromBody("plain  text\nanswer"), "plain text answer")
    assert.equal(reasonFromBody("<html><body>Bad gateway</body></html>", "HTTP 502"), "HTTP 502")
    assert.equal(reasonFromBody(undefined, "HTTP 500"), "HTTP 500")
    assert.equal(reasonFromBody("x".repeat(500)).length, 200)
    const scrubbed = reasonFromBody("request failed: token=abc123XYZ and Bearer eyJhbGciOi.payload.sig")
    assert.ok(!scrubbed.includes("abc123XYZ") && !scrubbed.includes("eyJhbGciOi"), scrubbed)
  })

  it("names a thrown error by type and network code, never by message", () => {
    const refused = Object.assign(new TypeError("fetch failed: https://x.test/?token=SECRET"), { cause: { code: "ECONNRESET" } })
    assert.deepEqual(classifyError(refused), { kind: "failed", reason: "TypeError: network error (ECONNRESET)" })
    assert.equal(classifyError(new DOMException("signal timed out", "TimeoutError")).kind, "timeout")
    assert.equal(classifyError(new DOMException("aborted", "AbortError")).kind, "timeout")
  })

  it("builds the row to store", () => {
    const denied = buildEvent({ provider: "massive", kind: "denied", input: "https://api.massive.com/v2/aggs/ticker/AAPL/prev?adjusted=true", reason: "budget spent", waitSeconds: 14.2, caller: "import" })
    assert.deepEqual(denied, {
      provider: "massive", kind: "denied", httpStatus: null, endpoint: "/v2/aggs/ticker/AAPL/prev", symbolsCount: 1,
      symbolsSample: "AAPL", reason: "budget spent", waitSeconds: 15, caller: "import", suppressed: 0,
    })
    const failed = buildEvent({ provider: "finnhub", kind: "failed", input: "https://finnhub.io/api/v1/quote?symbol=VTSAX", status: 403, body: '{"error":"You don\'t have access to this resource."}' })
    assert.equal(failed.httpStatus, 403)
    assert.equal(failed.reason, "You don't have access to this resource.")
    assert.equal(buildEvent({ provider: "finnhub", kind: "failed", input: "https://finnhub.io/api/v1/quote", status: 500 }).reason, "HTTP 500")
    assert.ok(!JSON.stringify(failed).includes("token"))
  })
})

describe("createEventLimiter", () => {
  const at = (iso: string) => Date.parse(iso)

  it("writes up to the cap each minute, then counts what it skipped and hands the count to the next write", () => {
    const limiter = createEventLimiter({ perMinute: 3 })
    const first = ["10:00:01", "10:00:02", "10:00:03", "10:00:04", "10:00:05"].map((t) => limiter.admit("finnhub", at(`2026-10-14T${t}Z`)))
    assert.deepEqual(first.map((a) => a.write), [true, true, true, false, false])
    // A new minute starts fresh and carries the two skipped events.
    assert.deepEqual(limiter.admit("finnhub", at("2026-10-14T10:01:00Z")), { write: true, suppressed: 2 })
    assert.deepEqual(limiter.admit("finnhub", at("2026-10-14T10:01:01Z")), { write: true, suppressed: 0 })
  })

  it("caps each provider on its own", () => {
    const limiter = createEventLimiter({ perMinute: 1 })
    const t = at("2026-10-14T10:00:00Z")
    assert.equal(limiter.admit("massive", t).write, true)
    assert.equal(limiter.admit("massive", t).write, false)
    assert.equal(limiter.admit("alpaca", t).write, true)
  })
})

describe("groupReasons", () => {
  const e = (provider: string, kind: "denied" | "failed", reason: string, at: string, httpStatus: number | null = null) => ({ provider, kind, reason, at, httpStatus })

  it("counts by provider, kind, status and reason, ignoring numbers, most frequent first, then most recent", () => {
    const groups = groupReasons([
      e("finnhub", "failed", "Invalid API key", "2026-10-14T04:00:00Z", 401),
      e("massive", "denied", "budget spent", "2026-10-14T04:01:00Z"),
      e("finnhub", "failed", "Invalid API key", "2026-10-14T05:00:00Z", 401),
      e("finnhub", "failed", "HTTP 502", "2026-10-14T05:05:00Z", 502),
      e("finnhub", "failed", "HTTP 503", "2026-10-14T05:06:00Z", 503),
    ])
    assert.deepEqual(groups.map((g) => [g.provider, g.reason, g.count]), [["finnhub", "Invalid API key", 2], ["finnhub", "HTTP 503", 1], ["finnhub", "HTTP 502", 1], ["massive", "budget spent", 1]])
    assert.equal(groups[0]!.last, "2026-10-14T05:00:00Z")
  })
})
