"use client"

import { motion } from "motion/react"
import { cn } from "@web/lib/utils"
import { formatPercent } from "@web/lib/format"
import "./benchmark-compare.css"

/** What /api/portfolio/benchmark returns. */
export type BenchmarkResponse = {
  symbol: string
  label: string
  description?: string
  basis: "price"
  reason: "no-history" | "no-benchmark-data" | "starts-late" | null
  comparison: {
    startDate: string
    endDate: string
    portfolioPercent: number
    benchmarkPercent: number
    differencePoints: number
    coverage: number
    series: { date: string; indexed: number }[]
  } | null
}

export const BENCHMARK_OPTIONS = [
  { value: "OFF", label: "Off" },
  { value: "SPY", label: "S&P 500" },
  { value: "QQQ", label: "Nasdaq 100" },
  { value: "VTI", label: "US market" },
] as const

export type BenchmarkChoice = (typeof BENCHMARK_OPTIONS)[number]["value"]

const WHY: Record<NonNullable<BenchmarkResponse["reason"]>, string> = {
  "no-history": "A comparison needs at least two tracked days.",
  "starts-late": "Benchmark prices don't reach back to your first tracked day yet, so there's nothing fair to compare.",
  "no-benchmark-data": "Benchmark prices aren't available right now. Try again later.",
}

/**
 * The comparison control under the portfolio's headline figures: pick a benchmark, and the chart
 * above switches to returns (deposits taken out) with the benchmark drawn beside your line. This
 * component only says what is being compared and what's missing; the numbers come from the API.
 */
export function BenchmarkCompare({
  choice,
  onChoose,
  loading,
  error,
  result,
}: {
  choice: BenchmarkChoice
  onChoose: (next: BenchmarkChoice) => void
  loading: boolean
  error: string | null
  result: BenchmarkResponse | null
}) {
  const c = result?.comparison ?? null
  const ahead = c ? c.differencePoints >= 0 : null

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="pf-eyebrow !text-[10px]">Compare</span>
        <div
          role="radiogroup"
          aria-label="Compare with a benchmark"
          className="flex flex-wrap gap-1"
          onKeyDown={(e) => {
            const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
            if (!step) return
            e.preventDefault()
            const at = BENCHMARK_OPTIONS.findIndex((o) => o.value === choice)
            const next = BENCHMARK_OPTIONS[(at + step + BENCHMARK_OPTIONS.length) % BENCHMARK_OPTIONS.length]!
            onChoose(next.value)
            ;(e.currentTarget.querySelector(`[data-v="${next.value}"]`) as HTMLElement | null)?.focus()
          }}
        >
          {BENCHMARK_OPTIONS.map((o) => {
            const on = o.value === choice
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                data-v={o.value}
                tabIndex={on ? 0 : -1}
                onClick={() => onChoose(o.value)}
                className={cn(
                  "h-6 rounded-full border px-2.5 text-[11px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--pf-ring)]",
                  on ? "border-input bg-secondary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </div>

      {choice !== "OFF" ? (
        <div className="min-h-[20px] text-xs text-muted-foreground" role="status" aria-live="polite">
          {loading && !c ? (
            <span className="pf-bm-shimmer">Loading {BENCHMARK_OPTIONS.find((o) => o.value === choice)?.label}…</span>
          ) : error && !c ? (
            <span>Couldn’t load the comparison. Pick the benchmark again to retry.</span>
          ) : result && !c && result.reason ? (
            <span>{WHY[result.reason]}</span>
          ) : c ? (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <i aria-hidden className="inline-block h-[3px] w-4 rounded-full" style={{ background: c.portfolioPercent >= 0 ? "var(--gain)" : "var(--loss)" }} />
                  You <b className={cn("numeric font-semibold", c.portfolioPercent >= 0 ? "text-gain-ink" : "text-loss-ink")}>{formatPercent(c.portfolioPercent)}</b>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i aria-hidden className="inline-block h-[3px] w-4 rounded-full bg-muted-foreground" />
                  {result?.label} <b className="numeric font-semibold text-foreground">{formatPercent(c.benchmarkPercent)}</b>
                </span>
                <span className={cn("numeric font-semibold", ahead ? "text-gain-ink" : "text-loss-ink")}>
                  {ahead ? "Ahead" : "Behind"} by {Math.abs(c.differencePoints).toFixed(2)} pts
                </span>
              </div>
              <span>
                Same dates, deposits removed. {result?.label} is the {result?.symbol} price return: dividends aren’t included, which understates it a little.
                {c.coverage < 1 ? " Some days had no benchmark close and are left out." : ""}
              </span>
            </motion.div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
