import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { defaultRange, rangeAvailability, rangeStart, keepsEntryValue, rangeUnlockDays, timeWeightedReturn, withLivePoint } from "./ranges.ts"

const point = (date: string, investableAssets: number, netFlows = 0) => ({
  date,
  investableAssets,
  netWorth: investableAssets,
  netFlows,
  isVerified: true,
})

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  )

describe("timeWeightedReturn", () => {
  it("reports a plain gain with no cash movement", () => {
    close(timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1100)]).percent, 10)
  })

  it("does not let a deposit inflate the return", () => {
    // Naive end/start would read +60%. The deposit must be divided out.
    close(timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1600, 500)]).percent, 10)
  })

  it("does not let a withdrawal depress the return", () => {
    close(timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 600, -500)]).percent, 10)
  })

  it("compounds periods rather than summing them", () => {
    // +10% then -10% is -1%, not 0%.
    close(
      timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1100), point("2026-01-03", 990)]).percent,
      -1,
    )
  })

  it("ranks a heavy depositor the same as someone who added nothing", () => {
    // This is the property the whole leaderboard rests on.
    const depositor = timeWeightedReturn([
      point("2026-01-01", 1000),
      point("2026-01-02", 1200),
      point("2026-01-03", 9440, 8000),
    ])
    const holder = timeWeightedReturn([
      point("2026-01-01", 1000),
      point("2026-01-02", 1200),
      point("2026-01-03", 1440),
    ])
    close(depositor.percent, holder.percent, 1e-9)
  })

  it("does not count a newly linked account as performance", () => {
    // Regression: every caller but the nightly sync used to pass no flow, so
    // connecting a $40k 401(k) on a $10k portfolio booked +100% (clamped from
    // +400%) straight into league standings and Board rank.
    const linked = timeWeightedReturn([point("2026-01-01", 10000), point("2026-01-02", 50000, 40000)])
    close(linked.percent, 0)
  })

  it("does not count removing an account as a loss", () => {
    const removed = timeWeightedReturn([point("2026-01-01", 50000), point("2026-01-02", 10000, -40000)])
    close(removed.percent, 0)
  })

  it("separates a real gain from a same-day account link", () => {
    // $10k grows 5% to $10.5k, and a $40k account is linked the same day.
    const mixed = timeWeightedReturn([point("2026-01-01", 10000), point("2026-01-02", 50500, 40000)])
    close(mixed.percent, 5)
  })

  it("skips periods that open at zero instead of reporting infinite return", () => {
    close(timeWeightedReturn([point("2026-01-01", 0), point("2026-01-02", 5000, 5000)]).percent, 0)
  })

  it("clamps an absurd single period rather than detonating the chain", () => {
    // A mis-signed flow or a mid-window disconnect shouldn't produce -99999%.
    const summary = timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1_000_000)])
    assert.ok(summary.percent <= 100, `expected clamp at 100%, got ${summary.percent}`)
  })

  it("has no return from a single snapshot", () => {
    const summary = timeWeightedReturn([point("2026-01-01", 1000)])
    assert.equal(summary.percent, 0)
    assert.equal(summary.days, 1)
  })

  it("returns an empty summary with no snapshots", () => {
    assert.deepEqual(timeWeightedReturn([]).series, [])
  })

  it("indexes the series to 100 at the start", () => {
    const { series } = timeWeightedReturn([point("2026-01-01", 1000), point("2026-01-02", 1100)])
    close(series[0]!.indexed, 100)
    close(series[1]!.indexed, 110)
  })
})

describe("rangeStart", () => {
  it("returns null for ALL so no lower bound is applied", () => {
    assert.equal(rangeStart("ALL"), null)
  })

  it("counts back the right number of days", () => {
    assert.equal(rangeStart("1W", new Date("2026-03-15T00:00:00Z")), "2026-03-08")
    assert.equal(rangeStart("1Y", new Date("2026-03-15T00:00:00Z")), "2025-03-15")
  })
})

describe("withLivePoint", () => {
  const live = { netWorth: 1100, investableAssets: 1100, isVerified: false }

  it("lets a return move today, before the nightly snapshot exists", () => {
    const points = withLivePoint([point("2026-01-01", 1000)], live, "2026-01-02")
    assert.equal(points.length, 2)
    close(timeWeightedReturn(points).percent, 10)
  })

  it("keeps today's recorded cash flow so a fresh deposit is not counted as a gain", () => {
    // 1000 yesterday, +500 deposited today (snapshot written with the flow), live value 1500.
    const points = withLivePoint(
      [point("2026-01-01", 1000), point("2026-01-02", 1500, 500)],
      { netWorth: 1500, investableAssets: 1500, isVerified: false },
      "2026-01-02",
    )
    assert.equal(points.length, 2)
    assert.equal(points[1]!.netFlows, 500)
    close(timeWeightedReturn(points).percent, 0)
  })

  it("replaces today's balances with live ones", () => {
    const points = withLivePoint([point("2026-01-01", 1000), point("2026-01-02", 1000)], live, "2026-01-02")
    assert.equal(points.length, 2)
    assert.equal(points[1]!.investableAssets, 1100)
    close(timeWeightedReturn(points).percent, 10)
  })

  it("adds nothing without history, or when the last snapshot is somehow in the future", () => {
    assert.deepEqual(withLivePoint([], live, "2026-01-02"), [])
    const future = [point("2026-01-05", 1000)]
    assert.deepEqual(withLivePoint(future, live, "2026-01-02"), future)
  })
})

describe("rangeAvailability", () => {
  it("only offers ALL before there is any history", () => {
    const a = rangeAvailability(null, "2026-09-30")
    assert.deepEqual(Object.entries(a).filter(([, on]) => on).map(([r]) => r), ["ALL"])
  })

  it("unlocks a range once tracking has lasted its length", () => {
    const threeDays = rangeAvailability("2026-09-27", "2026-09-30")
    assert.equal(threeDays["1W"], false)
    assert.equal(threeDays.ALL, true)

    const tenDays = rangeAvailability("2026-09-20", "2026-09-30")
    assert.equal(tenDays["1W"], true)
    assert.equal(tenDays["1M"], false)

    const twoMonths = rangeAvailability("2026-07-30", "2026-09-30")
    assert.equal(twoMonths["1M"], true)
    assert.equal(twoMonths["3M"], false)
  })
})

describe("defaultRange", () => {
  it("is ALL for young history and 1M once a month exists", () => {
    assert.equal(defaultRange("2026-09-27", "2026-09-30"), "ALL")
    assert.equal(defaultRange("2026-08-01", "2026-09-30"), "1M")
    assert.equal(defaultRange(null, "2026-09-30"), "ALL")
  })
})

describe("rangeUnlockDays", () => {
  it("counts the days left until each range has enough history", () => {
    const left = rangeUnlockDays("2026-09-27", "2026-09-30")
    assert.equal(left["1W"], 4)
    assert.equal(left["1M"], 27)
    assert.equal(left.ALL, 0)
    assert.equal(rangeUnlockDays("2026-01-01", "2026-09-30")["1Y"], 365 - 272)
  })
})

describe("keepsEntryValue", () => {
  it("protects the first day's entry value from a market-only write", () => {
    assert.equal(keepsEntryValue("2026-01-01", "2026-01-01", 0), true)
  })

  it("lets an edit that moves cash re-baseline the first day", () => {
    assert.equal(keepsEntryValue("2026-01-01", "2026-01-01", 5000), false)
  })

  it("lets every later day take the close, and a brand-new user get a row", () => {
    assert.equal(keepsEntryValue("2026-01-01", "2026-01-02", 0), false)
    assert.equal(keepsEntryValue(null, "2026-01-01", 0), false)
  })

  it("counts the first day's move on the second day", () => {
    // Entered at 1000 on day one; the close and the next close are 1010 and 1020.
    close(timeWeightedReturn([point("2026-01-01", 1000, 1000), point("2026-01-02", 1020)]).percent, 2)
  })
})
