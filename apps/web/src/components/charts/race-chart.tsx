"use client"

import { useId, useMemo, useState } from "react"
import { niceTicks, pointIndexAt, spreadLabels, tickDigits, xAt } from "@web/lib/chart-math"
import { formatPercent } from "@web/lib/format"
import { indexedDomain, visibleReturn } from "@web/lib/return-display"
import { cn } from "@web/lib/utils"
import { useMeasure } from "@web/lib/use-measure"

export type RaceSeries = { id: string; label: string; points: number[]; isYou: boolean }

// Deliberately no greens or reds: those hues mean gain and loss everywhere else,
// and a green line for someone who is down would read as a contradiction.
const SERIES = ["var(--series-1)", "var(--series-4)", "var(--series-5)", "var(--series-7)", "var(--series-2)"]
const MUTED = "hsl(var(--muted-foreground) / 0.35)"

const toneOf = (returnPct: number) => {
  const v = visibleReturn(returnPct)
  return v === 0 ? "hsl(var(--muted-foreground))" : v > 0 ? "var(--gain)" : "var(--loss)"
}

const shortName = (label: string, max = 9) => (label.length > max ? `${label.slice(0, max - 1)}…` : label)

/**
 * League members' returns on one axis, everyone starting at 0%.
 *
 * Internally the data is indexed to 100 (that's what makes a shared axis honest:
 * it compares rates of change, never portfolio sizes), but the axis speaks in
 * percent return because that's what people are asking. Each line ends in a dot
 * with a name and its return, hovering or touching shows everyone's value at
 * that point, and the lines draw in on load (instantly with reduced motion).
 *
 * Emphasis over categorical: you and the first few players get hues, everyone
 * else is context grey. Past five coloured lines nobody can tell them apart.
 */
export function RaceChart({
  series,
  height = 240,
  className,
}: {
  series: RaceSeries[]
  height?: number
  className?: string
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const [hoverX, setHoverX] = useState<number | null>(null)
  const gradientId = useId()

  const compact = width > 0 && width < 460
  const pad = { top: 14, right: compact ? 60 : 88, bottom: 26, left: compact ? 44 : 46 }

  const geometry = useMemo(() => {
    const usable = series
      .map((s) => ({ ...s, points: s.points.length === 1 ? [100, s.points[0]!] : s.points }))
      .filter((s) => s.points.length >= 2)
    if (width <= 0 || usable.length === 0) return null

    const plotW = Math.max(0, width - pad.left - pad.right)
    const innerH = height - pad.top - pad.bottom
    const length = Math.max(...usable.map((s) => s.points.length))
    const { lo, hi } = indexedDomain(usable.flatMap((s) => s.points))
    const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH

    const ticks = niceTicks(lo - 100, hi - 100, compact ? 3 : 4)
    const digits = tickDigits(ticks)

    const lines = usable.map((s, i) => {
      const d = s.points
        .map((v, k) => `${k === 0 ? "M" : "L"}${xAt(k, s.points.length, pad.left, plotW).toFixed(2)},${y(v).toFixed(2)}`)
        .join(" ")
      const last = s.points[s.points.length - 1]!
      return { ...s, d, last, color: s.isYou ? "hsl(var(--foreground))" : i < SERIES.length ? SERIES[i]! : MUTED, highlighted: s.isYou || i < SERIES.length }
    })

    // End labels: two lines (name, return) when there's room, else return only.
    const twoLine = innerH >= lines.length * 28
    const gap = twoLine ? 28 : 14
    const labelYs = spreadLabels(lines.map((l) => y(l.last)), gap, pad.top + 6, height - pad.bottom - 6)

    return { lines, plotW, y, length, ticks, digits, twoLine, labelYs, baselineY: y(100) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, width, height, compact])

  const you = geometry?.lines.find((l) => l.isYou)
  const summary = geometry
    ? `Race chart of returns since the start. ${[...geometry.lines].sort((a, b) => b.last - a.last).map((l) => `${l.isYou ? "You" : l.label} ${formatPercent(l.last - 100)}`).join(", ")}.`
    : "Race chart of returns"

  // What the pointer is over: one value per line, best first.
  const hover =
    geometry && hoverX !== null
      ? (() => {
          const idx = pointIndexAt(hoverX, pad.left, geometry.plotW, geometry.length)
          const atFraction = geometry.length <= 1 ? 1 : idx / (geometry.length - 1)
          const rows = geometry.lines
            .map((l) => {
              const k = Math.round(atFraction * (l.points.length - 1))
              return { id: l.id, label: l.isYou ? "You" : l.label, value: l.points[k]! - 100, color: l.color, isYou: l.isYou, y: geometry.y(l.points[k]!) }
            })
            .sort((a, b) => b.value - a.value)
          const x = xAt(idx, geometry.length, pad.left, geometry.plotW)
          const title = idx === 0 ? "Start" : idx === geometry.length - 1 ? "Now" : `Day ${idx}`
          return { x, title, rows }
        })()
      : null

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <svg
        width={width || "100%"}
        height={height}
        role="img"
        aria-label={summary}
        className="block select-none"
        style={{ touchAction: "pan-y" }}
        onPointerMove={(e) => setHoverX(e.clientX - e.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setHoverX(null)}
        onPointerCancel={() => setHoverX(null)}
      >
        {geometry ? (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.07} />
                <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Gridlines and the return each one stands for. */}
            {geometry.ticks.map((t) => {
              const ty = geometry.y(100 + t)
              const zero = t === 0
              return (
                <g key={t}>
                  <line
                    x1={pad.left}
                    x2={pad.left + geometry.plotW}
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
            })}

            <text x={pad.left} y={height - 6} className="fill-muted-foreground" fontSize={11}>
              Start
            </text>
            <text x={pad.left + geometry.plotW} y={height - 6} textAnchor="end" className="fill-muted-foreground" fontSize={11}>
              Now
            </text>

            {/* A soft wash under your line, toward the 0% line. */}
            {you ? (
              <path
                d={`${you.d} L${(pad.left + geometry.plotW).toFixed(2)},${geometry.baselineY.toFixed(2)} L${pad.left},${geometry.baselineY.toFixed(2)} Z`}
                fill={`url(#${gradientId})`}
                className="race-area"
              />
            ) : null}

            {/* Context lines first so highlighted ones sit on top. */}
            {geometry.lines.map((l) =>
              !l.highlighted ? (
                <path key={l.id} d={l.d} pathLength={1} className="race-line" fill="none" stroke={MUTED} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              ) : null,
            )}
            {geometry.lines.map((l, i) =>
              l.highlighted ? (
                <path
                  key={l.id}
                  d={l.d}
                  pathLength={1}
                  className="race-line"
                  style={{ animationDelay: `${i * 90}ms` }}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={l.isYou ? 3 : 2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null,
            )}

            {/* Where each line ends: a dot, a name and today's return. */}
            {geometry.lines.map((l, i) => {
              const ex = pad.left + geometry.plotW
              const ly = geometry.labelYs[i]!
              const returnPct = l.last - 100
              return (
                <g key={`end-${l.id}`} className="race-end">
                  <circle cx={ex} cy={geometry.y(l.last)} r={l.isYou ? 4.5 : 3.5} fill={l.color} stroke="hsl(var(--card))" strokeWidth={2} />
                  {geometry.twoLine ? (
                    <>
                      <text x={ex + 10} y={ly - 5} dominantBaseline="middle" fontSize={11} className={l.isYou ? "fill-foreground font-semibold" : "fill-muted-foreground"}>
                        {l.isYou ? "You" : shortName(l.label, compact ? 6 : 9)}
                      </text>
                      <text x={ex + 10} y={ly + 8} dominantBaseline="middle" fontSize={12} fontWeight={600} className="numeric" style={{ fill: toneOf(returnPct) }}>
                        {formatPercent(returnPct)}
                      </text>
                    </>
                  ) : (
                    <text x={ex + 10} y={ly} dominantBaseline="middle" fontSize={11} fontWeight={600} className="numeric" style={{ fill: toneOf(returnPct) }}>
                      {formatPercent(returnPct)}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Hover: a guide line and a dot on every series. */}
            {hover ? (
              <g pointerEvents="none">
                <line x1={hover.x} x2={hover.x} y1={pad.top} y2={height - pad.bottom} className="stroke-foreground" strokeOpacity={0.25} strokeWidth={1} />
                {hover.rows.map((r) => (
                  <circle key={r.id} cx={hover.x} cy={r.y} r={4} fill={r.color} stroke="hsl(var(--card))" strokeWidth={2} />
                ))}
              </g>
            ) : null}
          </>
        ) : null}
      </svg>

      {hover ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 min-w-36 rounded-xl border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{ top: pad.top, left: hover.x > width / 2 ? undefined : hover.x + 12, right: hover.x > width / 2 ? width - hover.x + 12 : undefined }}
        >
          <p className="mb-1 font-medium text-muted-foreground">{hover.title}</p>
          <ul className="space-y-0.5">
            {hover.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className={r.isYou ? "font-semibold" : ""}>{shortName(r.label, 12)}</span>
                </span>
                <span className="numeric font-semibold" style={{ color: toneOf(r.value) }}>
                  {formatPercent(r.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Standings in text form, best first: the same numbers, readable without the chart. */}
      {geometry ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {[...geometry.lines]
            .sort((a, b) => b.last - a.last)
            .map((l) => (
              <li key={l.id} className="flex items-center gap-1.5 text-xs">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
                <span className={cn("truncate", l.isYou ? "font-semibold" : "text-muted-foreground")}>{l.isYou ? "You" : l.label}</span>
                <span className="numeric font-medium" style={{ color: toneOf(l.last - 100) }}>
                  {formatPercent(l.last - 100)}
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  )
}
