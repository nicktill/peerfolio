"use client"

import { useMemo, useState } from "react"
import { cn } from "@web/lib/utils"
import { useMeasure } from "@web/lib/use-measure"
import { niceTicks } from "@web/lib/chart-math"

const PAD = { top: 10, right: 8, bottom: 22, left: 36 }

const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)

/**
 * Peak usage over time with the provider's real limit as a dashed reference
 * line. The limit is always inside the domain, so headroom is visible even
 * when usage is a sliver of it.
 */
export function UsageLineChart({
  points,
  limit,
  unit,
  formatTime,
  height = 180,
  ariaLabel,
  className,
}: {
  points: { t: string; value: number }[]
  limit: number
  unit: string
  formatTime: (iso: string) => string
  height?: number
  ariaLabel: string
  className?: string
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const g = useMemo(() => {
    if (width <= 0 || points.length < 2) return null
    const hi = Math.max(limit, ...points.map((p) => p.value)) * 1.08
    const innerW = width - PAD.left - PAD.right
    const innerH = height - PAD.top - PAD.bottom
    const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
    const y = (v: number) => PAD.top + innerH - (v / hi) * innerH
    const coords = points.map((p, i) => [x(i), y(p.value)] as const)
    const line = coords.map(([cx, cy], i) => `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${cy.toFixed(1)}`).join(" ")
    const floor = PAD.top + innerH
    const area = `${line} L${coords[coords.length - 1]![0].toFixed(1)},${floor} L${coords[0]![0].toFixed(1)},${floor} Z`
    return { x, y, line, area, innerW, ticks: niceTicks(0, hi, 3), floor }
  }, [points, limit, width, height])

  const active = hover != null ? points[hover] : null

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!g) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left - PAD.left) / g.innerW
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
  }

  const labelAt = [0, Math.floor((points.length - 1) / 2), points.length - 1]

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <svg width={width || "100%"} height={height} role="img" aria-label={ariaLabel} className="select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {g ? (
          <>
            {g.ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + g.innerW} y1={g.y(t)} y2={g.y(t)} className="stroke-border" strokeOpacity={0.6} strokeDasharray="4 5" />
                <text x={PAD.left - 6} y={g.y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground numeric" fontSize={11}>{compact(t)}</text>
              </g>
            ))}
            <line x1={PAD.left} x2={PAD.left + g.innerW} y1={g.y(limit)} y2={g.y(limit)} stroke="var(--loss)" strokeWidth={1.25} strokeDasharray="5 4" />
            <text x={PAD.left + g.innerW} y={g.y(limit) - 5} textAnchor="end" fontSize={11} fill="var(--loss)">limit {compact(limit)}/{unit}</text>
            <path d={g.area} fill="var(--series-1)" opacity={0.14} />
            <path d={g.line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {labelAt.map((i, n) => (
              <text key={i} x={g.x(i)} y={height - 6} textAnchor={n === 0 ? "start" : n === 2 ? "end" : "middle"} className="fill-muted-foreground" fontSize={11}>{formatTime(points[i]!.t)}</text>
            ))}
            {hover != null && active ? (
              <g>
                <line x1={g.x(hover)} x2={g.x(hover)} y1={PAD.top} y2={g.floor} className="stroke-muted-foreground/40" />
                <circle cx={g.x(hover)} cy={g.y(active.value)} r={4} fill="var(--series-1)" />
              </g>
            ) : null}
          </>
        ) : null}
      </svg>
      {g && hover != null && active ? (
        <div
          className="pointer-events-none absolute top-1 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(g.x(hover) - 60, 0), Math.max(0, width - 130)) }}
        >
          <div className="numeric font-medium">{active.value.toLocaleString()} / {unit}</div>
          <div className="text-muted-foreground">{formatTime(active.t)}</div>
        </div>
      ) : null}
    </div>
  )
}

export type BarSeries = { key: string; label: string; color: string; values: number[] }

/** Grouped bars, one group per label (a day), one bar per series (a provider). */
export function GroupedBarChart({
  labels,
  series,
  height = 190,
  ariaLabel,
  className,
}: {
  labels: string[]
  series: BarSeries[]
  height?: number
  ariaLabel: string
  className?: string
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const g = useMemo(() => {
    if (width <= 0 || labels.length === 0) return null
    const hi = Math.max(1, ...series.flatMap((s) => s.values)) * 1.08
    const innerW = width - PAD.left - PAD.right
    const innerH = height - PAD.top - PAD.bottom
    const group = innerW / labels.length
    const gap = Math.min(10, group * 0.25)
    const bar = Math.max(1.5, (group - gap) / Math.max(1, series.length))
    const y = (v: number) => PAD.top + innerH - (v / hi) * innerH
    return { group, bar, gap, y, innerW, floor: PAD.top + innerH, ticks: niceTicks(0, hi, 3) }
  }, [labels, series, width, height])

  const every = labels.length > 14 ? Math.ceil(labels.length / 8) : 1

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <svg width={width || "100%"} height={height} role="img" aria-label={ariaLabel} className="select-none" onPointerLeave={() => setHover(null)}>
        {g ? (
          <>
            {g.ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + g.innerW} y1={g.y(t)} y2={g.y(t)} className="stroke-border" strokeOpacity={0.6} strokeDasharray="4 5" />
                <text x={PAD.left - 6} y={g.y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground numeric" fontSize={11}>{compact(t)}</text>
              </g>
            ))}
            {labels.map((label, i) => {
              const x0 = PAD.left + i * g.group + g.gap / 2
              return (
                <g key={label} onPointerEnter={() => setHover(i)}>
                  <rect x={PAD.left + i * g.group} y={PAD.top} width={g.group} height={g.floor - PAD.top} fill="transparent" />
                  {series.map((s, k) => (
                    <rect key={s.key} x={x0 + k * g.bar} y={g.y(s.values[i] ?? 0)} width={Math.max(1, g.bar - 1)} height={g.floor - g.y(s.values[i] ?? 0)} rx={1.5} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.45} />
                  ))}
                  {i % every === 0 ? <text x={PAD.left + i * g.group + g.group / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>{label.slice(5)}</text> : null}
                </g>
              )
            })}
          </>
        ) : null}
      </svg>
      {g && hover != null ? (
        <div className="pointer-events-none absolute top-1 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm" style={{ left: Math.min(Math.max(PAD.left + hover * g.group - 40, 0), Math.max(0, width - 150)) }}>
          <div className="font-medium">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} className="numeric flex items-center gap-1.5"><span className="inline-block size-2 rounded-sm" style={{ background: s.color }} />{s.label} {(s.values[hover] ?? 0).toLocaleString()}</div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
