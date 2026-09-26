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

  const min = Math.min(...points)
  const max = Math.max(...points)
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1
  const pad = 2

  const coords = points.map((value, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - pad - ((value - min) / span) * (height - pad * 2)
    return [x, y] as const
  })

  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  const rising = points[points.length - 1]! >= points[0]!
  const [lastX, lastY] = coords[coords.length - 1]!

  return (
    <svg width={width} height={height} className={cn("overflow-visible", className)} aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={rising ? "var(--gain)" : "var(--loss)"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={rising ? "var(--gain)" : "var(--loss)"} />
    </svg>
  )
}
