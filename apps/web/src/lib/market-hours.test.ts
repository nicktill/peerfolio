import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { captureSession, isSessionPrint, isTradingSession, latestStartedSession, isUsMarketOpen, regularSession } from "./market-hours.ts"

describe("isTradingSession", () => {
  it("is open 9:30am to 4pm New York time, to the minute", () => {
    assert.equal(isTradingSession(new Date("2026-09-29T13:29:59Z")), false)
    assert.equal(isTradingSession(new Date("2026-09-29T13:30:00Z")), true)
    assert.equal(isTradingSession(new Date("2026-09-29T19:59:59Z")), true)
    assert.equal(isTradingSession(new Date("2026-09-29T20:00:00Z")), false) // no grace for trading
  })

  it("follows daylight saving", () => {
    assert.equal(isTradingSession(new Date("2026-12-15T14:29:00Z")), false)
    assert.equal(isTradingSession(new Date("2026-12-15T14:30:00Z")), true)
    assert.equal(isTradingSession(new Date("2026-12-15T21:00:00Z")), false)
  })

  it("is closed on weekends, overnight, pre-market and after hours", () => {
    assert.equal(isTradingSession(new Date("2026-10-03T15:00:00Z")), false) // Saturday
    assert.equal(isTradingSession(new Date("2026-10-04T15:00:00Z")), false) // Sunday
    assert.equal(isTradingSession(new Date("2026-09-30T03:00:00Z")), false) // overnight
    assert.equal(isTradingSession(new Date("2026-09-29T12:00:00Z")), false) // 8am pre-market
    assert.equal(isTradingSession(new Date("2026-09-29T23:30:00Z")), false) // 7:30pm after hours
  })

  it("is closed on market holidays", () => {
    for (const day of ["2026-11-26", "2026-12-25", "2026-07-03", "2026-04-03", "2027-01-01", "2027-07-05"]) {
      assert.equal(isTradingSession(new Date(`${day}T16:00:00Z`)), false, day)
    }
  })

  it("closes at 1pm on early-close days", () => {
    assert.equal(isTradingSession(new Date("2026-11-27T17:59:00Z")), true) // 12:59pm EST
    assert.equal(isTradingSession(new Date("2026-11-27T18:00:00Z")), false) // 1:00pm EST
    assert.equal(isTradingSession(new Date("2026-12-24T19:00:00Z")), false) // 2pm Christmas Eve
  })
})

describe("isUsMarketOpen (live refresh window)", () => {
  it("keeps a few minutes past the close for the closing print", () => {
    assert.equal(isUsMarketOpen(new Date("2026-09-29T20:04:00Z")), true)
    assert.equal(isUsMarketOpen(new Date("2026-09-29T20:05:00Z")), false)
    assert.equal(isUsMarketOpen(new Date("2026-11-27T18:04:00Z")), true) // early close
    assert.equal(isUsMarketOpen(new Date("2026-11-27T18:05:00Z")), false)
  })

  it("stays shut on holidays", () => {
    assert.equal(isUsMarketOpen(new Date("2026-11-26T16:00:00Z")), false)
  })
})

describe("isSessionPrint", () => {
  it("counts regular-session prints and the closing print", () => {
    assert.equal(isSessionPrint(new Date("2026-09-29T13:30:00Z")), true)
    assert.equal(isSessionPrint(new Date("2026-09-29T20:00:30Z")), true)
  })

  it("rejects pre-market, after-hours, early-close and holiday prints", () => {
    assert.equal(isSessionPrint(new Date("2026-09-29T13:29:00Z")), false)
    assert.equal(isSessionPrint(new Date("2026-09-29T20:02:00Z")), false)
    assert.equal(isSessionPrint(new Date("2026-11-27T18:30:00Z")), false)
    assert.equal(isSessionPrint(new Date("2026-11-26T16:00:00Z")), false)
    assert.equal(isSessionPrint(new Date("2026-10-03T16:00:00Z")), false)
  })
})

describe("regularSession", () => {
  it("names the day's hours, or null when the market stays shut", () => {
    assert.deepEqual(regularSession(new Date("2026-09-29T16:00:00Z")), { date: "2026-09-29", open: 570, close: 960 })
    assert.deepEqual(regularSession(new Date("2026-11-27T16:00:00Z")), { date: "2026-11-27", open: 570, close: 780 })
    assert.equal(regularSession(new Date("2026-11-26T16:00:00Z")), null)
    // 11pm EDT Monday is still Monday in New York, though Tuesday in UTC.
    assert.equal(regularSession(new Date("2026-09-29T03:00:00Z"))?.date, "2026-09-28")
  })
})

describe("latestStartedSession", () => {
  it("is today once the bell has rung, and the previous trading day before it", () => {
    assert.equal(latestStartedSession(new Date("2026-10-14T15:00:00Z")), "2026-10-14")
    assert.equal(latestStartedSession(new Date("2026-10-14T20:00:00Z")), "2026-10-14")
    assert.equal(latestStartedSession(new Date("2026-10-14T12:00:00Z")), "2026-10-13")
  })

  it("skips weekends and holidays", () => {
    assert.equal(latestStartedSession(new Date("2026-10-17T16:00:00Z")), "2026-10-16")
    assert.equal(latestStartedSession(new Date("2026-10-19T12:00:00Z")), "2026-10-16")
    assert.equal(latestStartedSession(new Date("2026-11-26T16:00:00Z")), "2026-11-25")
  })
})

describe("captureSession", () => {
  it("is the same day once 4:30pm ET has passed on a normal weekday, the day before until then", () => {
    assert.equal(captureSession(new Date("2026-10-14T21:00:00Z")), "2026-10-14") // 17:00 EDT
    assert.equal(captureSession(new Date("2026-10-14T20:29:00Z")), "2026-10-13") // 16:29 EDT
    assert.equal(captureSession(new Date("2026-10-14T20:30:00Z")), "2026-10-14")
  })
  it("steps back over Thanksgiving: Friday before the early-close capture names Wednesday, not Thursday", () => {
    assert.equal(captureSession(new Date("2026-11-27T17:00:00Z")), "2026-11-25") // Fri 12:00 EST
    assert.equal(captureSession(new Date("2026-11-26T22:00:00Z")), "2026-11-25") // Thanksgiving itself
  })
  it("flips at 1:30pm ET on an early close", () => {
    assert.equal(captureSession(new Date("2026-11-27T18:25:00Z")), "2026-11-25") // 13:25
    assert.equal(captureSession(new Date("2026-11-27T18:35:00Z")), "2026-11-27") // 13:35
  })
  it("names Friday all weekend", () => {
    assert.equal(captureSession(new Date("2026-10-17T15:00:00Z")), "2026-10-16")
    assert.equal(captureSession(new Date("2026-10-18T23:00:00Z")), "2026-10-16")
  })
  it("handles the daylight saving weeks", () => {
    assert.equal(captureSession(new Date("2026-03-09T12:00:00Z")), "2026-03-06") // Mon 08:00 EDT, after spring forward
    assert.equal(captureSession(new Date("2026-03-06T21:29:00Z")), "2026-03-05") // Fri 16:29 EST (capture opens 21:30Z)
    assert.equal(captureSession(new Date("2026-03-06T21:31:00Z")), "2026-03-06")
    assert.equal(captureSession(new Date("2026-11-02T14:00:00Z")), "2026-10-30") // Mon 09:00 EST, after fall back
    assert.equal(captureSession(new Date("2026-11-02T22:00:00Z")), "2026-11-02") // Mon 17:00 EST
  })
})
