import { NextResponse } from "next/server"
import { ApiError, withUser } from "@web/lib/api"
import { BENCHMARKS, compareToBenchmark, isBenchmarkSymbol } from "@web/lib/benchmarks"
import { benchmarkCloses } from "@web/lib/benchmark-data"
import { trackedWindow } from "@web/lib/ai/portfolio-data"
import { isRange, type Range } from "@web/lib/returns"

const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places

/**
 * A benchmark indexed against the signed-in user's own time-weighted series over the same window.
 * Separate from the portfolio route so a benchmark outage can't touch the portfolio page, and so
 * viewers who never turn it on never cost a thing. Always answers 200 with either a comparison or
 * the reason there isn't one.
 */
export const GET = withUser<unknown>(async (userId, request) => {
  const url = new URL(request.url)
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase()
  if (!isBenchmarkSymbol(symbol)) throw new ApiError("Unknown benchmark", 400)
  const rangeParam = url.searchParams.get("range") ?? "1M"
  const range: Range = isRange(rangeParam) ? rangeParam : "1M"
  const meta = BENCHMARKS.find((b) => b.symbol === symbol)!

  const window = await trackedWindow(userId, range)
  if (!window || window.series.length < 2) {
    return NextResponse.json({ symbol, label: meta.label, basis: "price", comparison: null, reason: "no-history" })
  }

  const closes = await benchmarkCloses(symbol, window.series[0]!.date)
  const result = compareToBenchmark(window.series, closes)
  if (!result.ok) return NextResponse.json({ symbol, label: meta.label, basis: "price", comparison: null, reason: result.reason })

  const c = result.value
  return NextResponse.json({
    symbol,
    label: meta.label,
    description: meta.description,
    /** Price return: split-adjusted, dividends not added back. */
    basis: "price",
    reason: null,
    comparison: {
      startDate: c.startDate,
      endDate: c.endDate,
      portfolioPercent: round(c.portfolioPercent),
      benchmarkPercent: round(c.benchmarkPercent),
      differencePoints: round(c.differencePoints),
      coverage: round(c.coverage, 3),
      series: c.series.map((p) => ({ date: p.date, indexed: round(p.indexed, 3) })),
    },
  })
})
