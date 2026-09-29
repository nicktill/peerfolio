"use client"

import { indexedDomain } from "@web/lib/return-display"
import { useMemo } from "react"
import { cn } from "@web/lib/utils"
import { useMeasure } from "@web/lib/use-measure"

export type RaceSeries = { id: string; label: string; points: number[]; isYou: boolean }

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"]
const MUTED = "hsl(var(--muted-foreground) / 0.35)"

const PAD = { top: 10, bottom: 18 }

/**
 * League members' returns on one axis, indexed so everyone starts at 100.
 *
 * Indexing is what makes a shared axis honest — it compares rates of change
 * rather than portfolio sizes, which are never disclosed anyway.
 *
 * Emphasis over categorical: the leaders and you get hues, everyone else is
 * context grey. Past five coloured lines nobody can tell them apart.
 */
export function RaceChart({
  series,
  height = 200,
  className,
}: {
  series: RaceSeries[]
  height?: number
  className?: string
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()

  const geometry = useMemo(() => {
    const usable = series.map((s) => ({ ...s, points: s.points.length === 1 ? [100, s.points[0]!] : s.points })).filter((s) => s.points.length >= 2)
    if (width <= 0 || usable.length === 0) return null

    const length = Math.max(...usable.map((s) => s.points.length))
    const all = usable.flatMap((s) => s.points)
    const { lo, hi } = indexedDomain(all)

    const innerH = height - PAD.top - PAD.bottom
    const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH

    const paths = usable.map((s) => {
      // Series can be shorter than the longest; spread each over the full width.
      const step = s.points.length > 1 ? width / (s.points.length - 1) : width
      const d = s.points
        .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(v).toFixed(2)}`)
        .join(" ")
      return { ...s, d }
    })

    return { paths, baselineY: y(100), length }
  }, [series, width, height])

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg width={width || "100%"} height={height} role="img" aria-label="Indexed returns for league members">
        {geometry ? (
          <>
            {/* Everyone starts here; distance from it is the whole story. */}
            <line
              x1={0}
              y1={geometry.baselineY}
              x2={width}
              y2={geometry.baselineY}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray="4 4"
            />

            {/* Context lines first so highlighted ones sit on top. */}
            {geometry.paths.map((p, i) =>
              !p.isYou && i >= SERIES.length ? (
                <path key={p.id} d={p.d} fill="none" stroke={MUTED} strokeWidth={1.5} strokeLinecap="round" />
              ) : null,
            )}

            {geometry.paths.map((p, i) =>
              p.isYou || i < SERIES.length ? (
                <path
                  key={p.id}
                  d={p.d}
                  fill="none"
                  stroke={p.isYou ? "hsl(var(--foreground))" : SERIES[i % SERIES.length]!}
                  strokeWidth={p.isYou ? 2.5 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={p.isYou ? undefined : undefined}
                />
              ) : null,
            )}
          </>
        ) : null}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.slice(0, SERIES.length).map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: s.isYou ? "hsl(var(--foreground))" : SERIES[i % SERIES.length]! }}
              aria-hidden
            />
            <span className={cn("truncate", s.isYou ? "font-semibold" : "text-muted-foreground")}>
              {s.isYou ? "You" : s.label}
            </span>
          </li>
        ))}
        {series.length > SERIES.length ? (
          <li className="flex items-center gap-1.5 text-xs">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: MUTED }} aria-hidden />
            <span className="text-muted-foreground">{series.length - SERIES.length} more</span>
          </li>
        ) : null}
      </ul>
    </div>
  )
}
