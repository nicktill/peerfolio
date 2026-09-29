"use client"

import { indexedDomain, visibleReturn } from "@web/lib/return-display"
import { useSeen } from "@web/lib/use-seen"
import { cn } from "@web/lib/utils"

/**
 * A bare trend line for table rows — no axes, no labels, no tooltip.
 *
 * Decorative in the accessibility sense: the numeric return always sits beside
 * it, so the sparkline is hidden from screen readers rather than described.
 */
export function Sparkline({
  points,
  className,
  width = 96,
  height = 28,
}: {
  points: number[]
  className?: string
  width?: number
  height?: number
}) {
  // The trend line draws itself when the row scrolls into view.
  const { ref, seen } = useSeen<SVGSVGElement>(0.4)

  if (points.length < 2) {
    return (
      <svg width={width} height={height} className={cn("overflow-visible", className)} aria-hidden>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={2}
          strokeDasharray="3 3"
          className="text-muted-foreground/40"
        />
      </svg>
    )
  }

  const { lo: min, hi: max } = indexedDomain(points)
  const span = max - min
  const pad = 2

  const coords = points.map((value, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - pad - ((value - min) / span) * (height - pad * 2)
    return [x, y] as const
  })

  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  const change = visibleReturn(points[points.length - 1]! - points[0]!)
  const color = change === 0 ? "hsl(var(--muted-foreground))" : change > 0 ? "var(--gain)" : "var(--loss)"
  const [lastX, lastY] = coords[coords.length - 1]!

  return (
    <svg ref={ref} width={width} height={height} className={cn("overflow-visible", className)} aria-hidden>
      {/* No non-scaling-stroke here: it would measure the dash in screen pixels and break the draw-in. */}
      <path
        d={d}
        pathLength={1}
        className={seen ? "race-line" : "race-line-wait"}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} className={seen ? "race-end" : "opacity-0"} />
    </svg>
  )
}
