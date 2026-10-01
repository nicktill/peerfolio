"use client"

import { useId, useMemo, useState } from "react"
import { cn } from "@web/lib/utils"
import { useMeasure } from "@web/lib/use-measure"
import { niceTicks, tickDigits } from "@web/lib/chart-math"
import { formatCurrency, formatDate, formatPercent } from "@web/lib/format"
import { indexedDomain } from "@web/lib/return-display"

export type PerformancePoint = { date: string; value: number }

const PAD = { top: 12, right: 0, bottom: 22, left: 0 }
/** Room for the percentage labels down the left edge. */
const INDEXED_PAD = { top: 14, right: 8, bottom: 22, left: 46 }
/** With this few points, mark each one so a short history doesn't read as a bare diagonal. */
const MARK_EACH_UNDER = 9

/**
 * Single-series trend over time.
 *
 * One series, so there's no legend — the card title names it. Direction is
 * coloured but the value is always printed, so colour is never the only cue.
 */
export function PerformanceChart({
  points,
  height = 240,
  valueFormatter = (v: number) => formatCurrency(v, { compact: true }),
  className,
  ariaLabel,
  onHover,
  showTooltip = true,
  baseline,
  indexed = false,
}: {
  points: PerformancePoint[]
  height?: number
  valueFormatter?: (value: number) => string
  className?: string
  ariaLabel: string
  /** Called with the hovered point (or null on leave), for a readout outside the chart. */
  onHover?: (index: number | null) => void
  /** Turn off the floating tooltip when the page shows its own readout. */
  showTooltip?: boolean
  /** A value to draw a dashed reference line at (the 0% line for an indexed return). */
  baseline?: number
  /**
   * Values are a return indexed to 100 at the start. Draws a percentage axis
   * around the 0% line and never zooms tighter than a point of range, so a
   * -0.18% day looks like what it is instead of a cliff.
   */
  indexed?: boolean
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const fillId = useId()
  const pad = indexed ? INDEXED_PAD : PAD

  const geometry = useMemo(() => {
    if (width <= 0 || points.length < 2) return null

    const innerW = width - pad.left - pad.right
    const innerH = height - pad.top - pad.bottom

    const values = points.map((p) => p.value)
    let lo: number
    let hi: number
    if (indexed) {
      ;({ lo, hi } = indexedDomain(values))
    } else {
      const min = Math.min(...values, ...(baseline != null ? [baseline] : []))
      const max = Math.max(...values, ...(baseline != null ? [baseline] : []))
      // Pad the domain so a nearly-flat series doesn't hug the top and bottom edges.
      const span = max - min || Math.abs(max) * 0.1 || 1
      lo = min - span * 0.12
      hi = max + span * 0.12
    }

    const x = (i: number) => pad.left + (i / (points.length - 1)) * innerW
    const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH

    const coords = points.map((p, i) => [x(i), y(p.value)] as const)
    const line = coords.map(([cx, cy], i) => `${i === 0 ? "M" : "L"}${cx.toFixed(2)},${cy.toFixed(2)}`).join(" ")
    // Indexed returns wash toward the 0% line, so the tint is the gap between
    // where you are and where you started. Other series fill down to the axis.
    const floorY = indexed ? y(baseline ?? 100) : height - pad.bottom
    const area = `${line} L${coords[coords.length - 1]![0].toFixed(2)},${floorY.toFixed(2)} L${coords[0]![0].toFixed(2)},${floorY.toFixed(2)} Z`

    const ticks = indexed ? niceTicks(lo - 100, hi - 100, height < 260 ? 3 : 4) : []

    return { coords, line, area, innerW, ticks, digits: tickDigits(ticks), y, baselineY: baseline != null ? y(baseline) : null }
  }, [points, width, height, baseline, indexed, pad])

  const rising = points.length >= 2 && points[points.length - 1]!.value >= points[0]!.value
  const stroke = rising ? "var(--gain)" : "var(--loss)"
  const active = hoverIndex != null ? points[hoverIndex] : null

  function handlePointer(event: React.PointerEvent<SVGSVGElement>) {
    if (!geometry || points.length < 2) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left - pad.left) / (rect.width - pad.left - pad.right)
    const index = Math.round(ratio * (points.length - 1))
    const clamped = Math.max(0, Math.min(points.length - 1, index))
    setHoverIndex(clamped)
    onHover?.(clamped)
  }

  function clearHover() {
    setHoverIndex(null)
    onHover?.(null)
  }

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <svg
        width={width || "100%"}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="touch-none select-none"
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={clearHover}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={indexed && !rising ? 0 : 0.18} />
            <stop offset="100%" stopColor={stroke} stopOpacity={indexed && !rising ? 0.18 : 0} />
          </linearGradient>
        </defs>

        {geometry ? (
          <>
            {indexed ? (
              // A few quiet gridlines with their percentages, and 0% dashed: the line everything is measured from.
              geometry.ticks.map((t) => {
                const ty = geometry.y(100 + t)
                const zero = t === 0
                return (
                  <g key={t}>
                    <line
                      x1={pad.left}
                      x2={pad.left + geometry.innerW}
                      y1={ty}
                      y2={ty}
                      className="stroke-border"
                      strokeOpacity={zero ? 1 : 0.55}
                      strokeWidth={1}
                      strokeDasharray={zero ? "4 4" : undefined}
                    />
                    <text x={pad.left - 8} y={ty} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground numeric" fontSize={11}>
                      {zero ? "0%" : formatPercent(t, geometry.digits)}
                    </text>
                  </g>
                )
              })
            ) : (
              <>
                {/* Baseline only — a full grid competes with a single trend line. */}
                <line x1={0} y1={height - pad.bottom} x2={width} y2={height - pad.bottom} className="stroke-border" strokeWidth={1} />

                {geometry.baselineY != null ? (
                  <line
                    x1={0}
                    y1={geometry.baselineY}
                    x2={width}
                    y2={geometry.baselineY}
                    className="stroke-muted-foreground/50"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                ) : null}
              </>
            )}

            <path d={geometry.area} fill={`url(#${fillId})`} />
            <path
              d={geometry.line}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {indexed
              ? geometry.coords.map(([cx, cy], i) => {
                  const last = i === geometry.coords.length - 1
                  if (!last && geometry.coords.length >= MARK_EACH_UNDER) return null
                  return (
                    <g key={i}>
                      {last ? <circle cx={cx} cy={cy} r={9} fill={stroke} opacity={0.16} /> : null}
                      <circle cx={cx} cy={cy} r={last ? 4.5 : 3} fill={stroke} stroke="hsl(var(--card))" strokeWidth={2} />
                    </g>
                  )
                })
              : null}

            {hoverIndex != null && geometry.coords[hoverIndex] ? (
              <g>
                <line
                  x1={geometry.coords[hoverIndex]![0]}
                  y1={pad.top}
                  x2={geometry.coords[hoverIndex]![0]}
                  y2={height - pad.bottom}
                  className="stroke-border"
                  strokeWidth={1}
                />
                {/* Surface ring keeps the marker legible over the filled area. */}
                <circle
                  cx={geometry.coords[hoverIndex]![0]}
                  cy={geometry.coords[hoverIndex]![1]}
                  r={5}
                  fill={stroke}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                />
              </g>
            ) : null}
          </>
        ) : null}
      </svg>

      {/* Endpoint labels instead of a full axis. */}
      {points.length >= 2 ? (
        <div
          className="pointer-events-none absolute bottom-0 flex justify-between text-xs text-muted-foreground"
          style={{ left: pad.left, right: pad.right }}
        >
          <span>{formatDate(points[0]!.date, "short")}</span>
          <span>{formatDate(points[points.length - 1]!.date, "short")}</span>
        </div>
      ) : null}

      {active && showTooltip && hoverIndex != null && geometry?.coords[hoverIndex] ? (
        <div
          className="pointer-events-none absolute z-10 w-[8.5rem] rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            // Above the hovered point, kept inside the chart's edges.
            left: Math.min(Math.max(geometry.coords[hoverIndex]![0] - 68, 0), Math.max(width - 136, 0)),
            top: Math.max(geometry.coords[hoverIndex]![1] - 58, 0),
          }}
        >
          <div className="text-muted-foreground">{formatDate(active.date)}</div>
          <div className="numeric mt-0.5 font-semibold">{valueFormatter(active.value)}</div>
        </div>
      ) : null}
    </div>
  )
}
