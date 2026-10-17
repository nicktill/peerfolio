import { BENCHMARKS, compareToBenchmark } from "./benchmarks.ts"
import type { IndexedPoint } from "./benchmarks.ts"
import type { BenchmarkResponse } from "../components/dashboard/benchmark-compare"

/** Invented ETF paths for the demo only. Absolute dates keep overlapping ranges consistent. */
export function demoBenchmark(symbol: string, portfolio: IndexedPoint[]): BenchmarkResponse {
  const benchmark = BENCHMARKS.find((b) => b.symbol === symbol)!
  const tech = symbol === "QQQ"
  const broad = symbol === "VTI"
  const closes = portfolio.map(({ date }) => {
    const day = (Date.parse(`${date}T12:00:00Z`) - Date.parse("2025-01-01T12:00:00Z")) / 86_400_000
    const logPrice = day * (tech ? 0.00055 : 0.00038)
      + Math.sin(day / 25) * (tech ? 0.035 : 0.024)
      + Math.sin(day / 9 + (broad ? 0.25 : 0)) * (tech ? 0.012 : 0.008)
      + Math.cos(day / 62) * 0.035
    return { date, close: 100 * Math.exp(logPrice) }
  })
  const result = compareToBenchmark(portfolio, closes)
  return { symbol, label: benchmark.label, description: "Simulated demo history", basis: "price", reason: result.ok ? null : result.reason, comparison: result.ok ? result.value : null }
}
