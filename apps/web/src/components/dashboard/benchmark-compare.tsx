"use client"

import { motion } from "motion/react"
import { TickerLogo } from "@web/components/ui/ticker-logo"
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

/**
 * Each index is its own series: a colour and a line pattern the chart, chips and legend all share, so
 * nothing relies on colour alone. Your own line stays green or red, so none of these is either.
 */
export const BENCHMARK_STYLE: Record<Exclude<BenchmarkChoice, "OFF">, { color: string; dash: string }> = {
  SPY: { color: "var(--series-1)", dash: "7 5" },
  QQQ: { color: "var(--series-7)", dash: "1.5 5" },
  VTI: { color: "var(--series-4)", dash: "11 4 2 4" },
}

const WHY: Record<NonNullable<BenchmarkResponse["reason"]>, string> = {
  "no-history": "A comparison needs at least two tracked days.",
  "starts-late": "Benchmark prices don't reach back to your first tracked day yet, so there's nothing fair to compare.",
  "no-benchmark-data": "Benchmark prices aren't available right now. Try again later.",
}

/** A sample of the line as drawn on the chart. */
function Swatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden className="shrink-0">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  )
}

/**
 * The comparison control under the portfolio's headline figures: pick an index, and the chart
 * above switches to returns (deposits taken out) with that index drawn beside your line. This
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
  const style = choice === "OFF" ? null : BENCHMARK_STYLE[choice]
  const youColor = c && c.portfolioPercent < 0 ? "var(--loss)" : "var(--gain)"

  return (
    <div className="pf-bm">
      <div className="pf-bm-row">
        <span className="pf-eyebrow !text-[10px]">Compare</span>
        <div
          role="radiogroup"
          aria-label="Compare with a benchmark"
          className="pf-bm-chips"
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
            const s = o.value === "OFF" ? null : BENCHMARK_STYLE[o.value]
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                data-v={o.value}
                tabIndex={on ? 0 : -1}
                onClick={() => onChoose(o.value)}
                className={cn("pf-bm-chip", on && "is-on")}
                style={on && s ? ({ "--bm": s.color } as React.CSSProperties) : undefined}
              >
                {s ? <TickerLogo symbol={o.value} size="xs" className="!size-[14px]" /> : null}
                {o.label}
              </button>
            )
          })}
        </div>
      </div>

      {choice !== "OFF" ? (
        <div className="pf-bm-detail" role="status" aria-live="polite">
          {loading && !c ? (
            <span className="pf-bm-shimmer">Loading {BENCHMARK_OPTIONS.find((o) => o.value === choice)?.label}…</span>
          ) : error && !c ? (
            <span>Couldn’t load the comparison. Pick the index again to retry.</span>
          ) : result && !c && result.reason ? (
            <span>{WHY[result.reason]}</span>
          ) : c && style ? (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="pf-bm-legend">
              <span className="pf-bm-key">
                <Swatch color={youColor} />
                You
                <b className={cn("numeric", c.portfolioPercent >= 0 ? "text-gain-ink" : "text-loss-ink")}>{formatPercent(c.portfolioPercent)}</b>
              </span>
              <span className="pf-bm-key">
                <Swatch color={style.color} dash={style.dash} />
                {result?.label}
                <b className="numeric">{formatPercent(c.benchmarkPercent)}</b>
              </span>
              <span className={cn("pf-bm-gap numeric", ahead ? "text-gain-ink" : "text-loss-ink")}>
                {ahead ? "▲ Ahead" : "▼ Behind"} {Math.abs(c.differencePoints).toFixed(2)} pts
              </span>
              <span className="pf-bm-note">
                Deposits removed · {result?.symbol} price return, dividends excluded
                {c.coverage < 1 ? " · some days had no close" : ""}
              </span>
            </motion.div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
