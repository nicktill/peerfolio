import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { acceptQuote, createQuoteProvider, isUsMarketOpen, priceLabel, quoteDate } from "./quote-provider.ts"
import { latestCompletedSession } from "./market-hours.ts"

describe("isUsMarketOpen", () => {
  it("opens at 9:30 ET and closes just after 4:00 ET in summer (EDT, UTC-4)", () => {
    assert.equal(isUsMarketOpen(new Date("2026-09-29T13:29:00Z")), false)
    assert.equal(isUsMarketOpen(new Date("2026-09-29T13:30:00Z")), true)
    assert.equal(isUsMarketOpen(new Date("2026-09-29T20:04:00Z")), true)
    assert.equal(isUsMarketOpen(new Date("2026-09-29T20:05:00Z")), false)
  })

  it("follows daylight saving: the same clock times are an hour later in UTC in winter (EST, UTC-5)", () => {
    assert.equal(isUsMarketOpen(new Date("2026-12-15T14:29:00Z")), false)
    assert.equal(isUsMarketOpen(new Date("2026-12-15T14:30:00Z")), true)
    assert.equal(isUsMarketOpen(new Date("2026-12-15T21:04:00Z")), true)
    assert.equal(isUsMarketOpen(new Date("2026-12-15T21:05:00Z")), false)
  })

  it("is closed all weekend", () => {
    assert.equal(isUsMarketOpen(new Date("2026-09-26T15:00:00Z")), false) // Saturday
    assert.equal(isUsMarketOpen(new Date("2026-09-27T15:00:00Z")), false) // Sunday
  })

  it("is closed overnight", () => {
    assert.equal(isUsMarketOpen(new Date("2026-09-29T03:00:00Z")), false)
    assert.equal(isUsMarketOpen(new Date("2026-09-29T22:30:00Z")), false) // when the nightly job runs
  })
})

describe("acceptQuote", () => {
  const now = new Date("2026-09-29T17:00:00Z")

  it("accepts a fresh positive price", () => {
    assert.equal(acceptQuote({ price: 228.86, asOf: "2026-09-29T16:59:30.000Z" }, now), true)
  })

  it("rejects a stale print, such as a holiday's or a halted stock's last trade", () => {
    assert.equal(acceptQuote({ price: 228.86, asOf: "2026-09-28T20:00:00.000Z" }, now), false)
    assert.equal(acceptQuote({ price: 228.86, asOf: "2026-09-29T16:20:00.000Z" }, now), false) // 40 minutes old
  })

  it("rejects missing, zero, negative, non-finite prices and bad timestamps", () => {
    assert.equal(acceptQuote(undefined, now), false)
    assert.equal(acceptQuote({ price: 0, asOf: "2026-09-29T16:59:00.000Z" }, now), false)
    assert.equal(acceptQuote({ price: -3, asOf: "2026-09-29T16:59:00.000Z" }, now), false)
    assert.equal(acceptQuote({ price: Number.NaN, asOf: "2026-09-29T16:59:00.000Z" }, now), false)
    assert.equal(acceptQuote({ price: 10, asOf: "not a date" }, now), false)
  })

  it("rejects a timestamp far in the future but tolerates a little clock skew", () => {
    assert.equal(acceptQuote({ price: 10, asOf: "2026-09-29T17:02:00.000Z" }, now), true)
    assert.equal(acceptQuote({ price: 10, asOf: "2026-09-29T18:00:00.000Z" }, now), false)
  })
})

describe("createQuoteProvider", () => {
  it("builds Finnhub by default when a key is present", () => {
    assert.equal(createQuoteProvider({ FINNHUB_API_KEY: "k" })?.name, "finnhub")
  })

  it("is off without a key, so everything falls back to daily closes", () => {
    assert.equal(createQuoteProvider({}), null)
  })

  it("can be switched off explicitly", () => {
    assert.equal(createQuoteProvider({ QUOTE_PROVIDER: "off", FINNHUB_API_KEY: "k" }), null)
    assert.equal(createQuoteProvider({ QUOTE_PROVIDER: "none", FINNHUB_API_KEY: "k" }), null)
  })

  it("does not build an unknown provider", () => {
    assert.equal(createQuoteProvider({ QUOTE_PROVIDER: "nope", FINNHUB_API_KEY: "k" }), null)
  })
})

describe("quoteDate and priceLabel", () => {
  it("takes the trading date from the last trade", () => {
    assert.equal(quoteDate({ price: 1, asOf: "2026-09-29T16:59:30.000Z" }), "2026-09-29")
  })

  it("says live only while the market is open and the price is from today", () => {
    const open = new Date("2026-09-29T17:00:00Z")
    assert.equal(priceLabel("2026-09-29", open), "live")
    assert.equal(priceLabel("2026-09-28", open), "close")
    assert.equal(priceLabel("2026-09-29", new Date("2026-09-29T22:30:00Z")), "close")
    assert.equal(priceLabel(null, open), "close")
  })
})

describe("latestCompletedSession", () => {
  it("is today once it's past 4:30pm New York time on a weekday", () => {
    assert.equal(latestCompletedSession(new Date("2026-09-29T21:00:00Z")), "2026-09-29") // 5:00pm EDT
    assert.equal(latestCompletedSession(new Date("2026-09-29T22:46:00Z")), "2026-09-29") // when the nightly job ran
  })

  it("is the previous weekday before then, including the morning after", () => {
    assert.equal(latestCompletedSession(new Date("2026-09-29T20:29:00Z")), "2026-09-28") // 4:29pm EDT
    assert.equal(latestCompletedSession(new Date("2026-09-30T13:00:00Z")), "2026-09-29") // 9:00am EDT next day
    assert.equal(latestCompletedSession(new Date("2026-09-30T00:40:00Z")), "2026-09-29") // 8:40pm EDT, UTC already rolled over
  })

  it("skips weekends", () => {
    assert.equal(latestCompletedSession(new Date("2026-09-26T15:00:00Z")), "2026-09-25") // Saturday
    assert.equal(latestCompletedSession(new Date("2026-09-27T23:00:00Z")), "2026-09-25") // Sunday evening
    assert.equal(latestCompletedSession(new Date("2026-09-28T13:00:00Z")), "2026-09-25") // Monday before the close
  })

  it("follows daylight saving", () => {
    assert.equal(latestCompletedSession(new Date("2026-12-15T21:29:00Z")), "2026-12-14") // 4:29pm EST
    assert.equal(latestCompletedSession(new Date("2026-12-15T21:30:00Z")), "2026-12-15") // 4:30pm EST
  })
})
