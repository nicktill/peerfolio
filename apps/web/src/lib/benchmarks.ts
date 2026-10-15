/**
 * Benchmark comparison math. Free of database and framework imports.
 *
 * A fair comparison puts both lines on the same footing: each indexed to 100 on
 * the portfolio's first tracked day, using the benchmark's last close on or
 * before each date (never a later one), and with the portfolio's series already
 * net of deposits (time-weighted). Benchmarks here are ETF *price* returns:
 * split-adjusted but without dividends, which understates them by roughly the
 * fund's yield. The interface says so.
 */

export type Benchmark = { symbol: string; label: string; description: string }

export const BENCHMARKS: Benchmark[] = [
  { symbol: "SPY", label: "S&P 500", description: "SPDR S&P 500 ETF" },
  { symbol: "QQQ", label: "Nasdaq 100", description: "Invesco QQQ Trust" },
  { symbol: "VTI", label: "US total market", description: "Vanguard Total Stock Market ETF" },
]

export const isBenchmarkSymbol = (s: string) => BENCHMARKS.some((b) => b.symbol === s)

export type IndexedPoint = { date: string; indexed: number }
export type Close = { date: string; close: number }

export type Comparison = {
  /** The benchmark indexed to 100 on `startDate`, one point per portfolio date it has a close for. */
  series: IndexedPoint[]
  startDate: string
  endDate: string
  portfolioPercent: number
  benchmarkPercent: number
  /** Portfolio minus benchmark, in percentage points. */
  differencePoints: number
  /** Share of portfolio dates the benchmark had a close on or before; 1 means no date was skipped. */
  coverage: number
}

export type ComparisonResult = { ok: true; value: Comparison } | { ok: false; reason: "no-history" | "no-benchmark-data" | "starts-late" }

/** The portfolio's start must be covered by a benchmark close within this many days (a long weekend). */
const MAX_START_GAP_DAYS = 5
const dayMs = 86_400_000
const t = (date: string) => Date.parse(`${date}T12:00:00Z`)

/**
 * Indexes `closes` to the portfolio's dates. Returns a reason instead of a
 * number when an honest comparison isn't possible: too little portfolio
 * history, no benchmark data, or benchmark data that starts after the portfolio.
 */
export function compareToBenchmark(portfolio: IndexedPoint[], closes: Close[]): ComparisonResult {
  if (portfolio.length < 2) return { ok: false, reason: "no-history" }
  if (closes.length === 0) return { ok: false, reason: "no-benchmark-data" }

  const sorted = [...closes].filter((c) => c.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1))
  if (sorted.length === 0) return { ok: false, reason: "no-benchmark-data" }

  const first = portfolio[0]!
  // Last close on or before each date: a pointer walking both sorted lists once.
  let j = -1
  const atOrBefore = (date: string): Close | null => {
    while (j + 1 < sorted.length && sorted[j + 1]!.date <= date) j++
    return j >= 0 ? sorted[j]! : null
  }

  const base = atOrBefore(first.date)
  if (!base || (t(first.date) - t(base.date)) / dayMs > MAX_START_GAP_DAYS) return { ok: false, reason: "starts-late" }

  const series: IndexedPoint[] = []
  for (const p of portfolio) {
    const c = atOrBefore(p.date)
    if (c) series.push({ date: p.date, indexed: (c.close / base.close) * 100 })
  }

  const last = portfolio[portfolio.length - 1]!
  const benchEnd = series[series.length - 1]!
  const portfolioPercent = (last.indexed / first.indexed - 1) * 100
  const benchmarkPercent = benchEnd.indexed - 100
  return {
    ok: true,
    value: {
      series,
      startDate: first.date,
      endDate: last.date,
      portfolioPercent,
      benchmarkPercent,
      differencePoints: portfolioPercent - benchmarkPercent,
      coverage: series.length / portfolio.length,
    },
  }
}
