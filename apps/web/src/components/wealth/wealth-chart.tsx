"use client"

import { useCallback, useId, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { useMeasure } from "@web/lib/use-measure"
import { niceTicks } from "@web/lib/chart-math"
import type { Projection, ScenarioSet } from "@web/lib/wealth/engine"
import { duration, usd, usdCompact } from "./format"

export type SeriesKind = "nominal" | "real"

const PAD = { top: 14, right: 12, bottom: 26, left: 52 }
const SAMPLES = 96

/** Value of a projection at a (possibly fractional) month, linearly interpolated. */
function valueAt(p: Projection, month: number, kind: SeriesKind): number {
  const i = Math.min(p.points.length - 1, Math.max(0, month))
  const lo = Math.floor(i)
  const hi = Math.min(p.points.length - 1, lo + 1)
  const f = i - lo
  return p.points[lo]![kind] * (1 - f) + p.points[hi]![kind] * f
}

/**
 * Three scenarios on one chart. Every series is resampled to a fixed number of points, so the path
 * keeps the same structure when inputs change and the browser can morph it instead of redrawing.
 */
export function WealthChart({
  set,
  kind,
  target,
  targetMonth,
  ariaLabel,
  onHover,
}: {
  set: ScenarioSet
  kind: SeriesKind
  target: number
  targetMonth: number | null
  ariaLabel: string
  onHover: (month: number | null) => void
}) {
  const { ref, width } = useMeasure<HTMLDivElement>()
  const reduce = useReducedMotion()
  const fillId = useId()
  const [hover, setHover] = useState<number | null>(null)
  const height = width > 0 && width < 520 ? 260 : 340
  const months = set.base.months
  const spring = reduce ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const }

  const g = useMemo(() => {
    if (width <= 0) return null
    const innerW = Math.max(1, width - PAD.left - PAD.right)
    const innerH = height - PAD.top - PAD.bottom
    const top = Math.max(...set.optimistic.points.map((p) => p[kind]), 1)
    // Keep the target line in frame unless it sits far above everything (then it's labelled at the edge).
    const targetInFrame = target > 0 && target <= top * 1.6
    const hi = Math.max(top, targetInFrame ? target : 0) * 1.06
    const yTicks = niceTicks(0, hi, height < 300 ? 3 : 4)
    const yMax = yTicks.length ? Math.max(hi, yTicks[yTicks.length - 1]!) : hi
    const x = (m: number) => PAD.left + (months === 0 ? 0 : (m / months) * innerW)
    const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH
    const path = (p: Projection) =>
      Array.from({ length: SAMPLES + 1 }, (_, s) => {
        const m = (s / SAMPLES) * months
        return `${s === 0 ? "M" : "L"}${x(m).toFixed(1)},${y(valueAt(p, m, kind)).toFixed(1)}`
      }).join(" ")
    const base = path(set.base)
    const floor = (height - PAD.bottom).toFixed(1)
    const area = `${base} L${x(months).toFixed(1)},${floor} L${x(0).toFixed(1)},${floor} Z`
    const yearTicks = niceTicks(0, months / 12, width < 520 ? 4 : 7).filter((t) => Number.isInteger(t))
    return {
      x, y, innerW, yTicks, yearTicks, base, area, targetInFrame,
      cons: path(set.conservative), opt: path(set.optimistic),
    }
  }, [set, kind, target, width, height, months])

  const setMonth = useCallback((m: number | null) => { setHover(m); onHover(m) }, [onHover])

  function pointer(e: React.PointerEvent<SVGSVGElement>) {
    if (!g || months === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const f = (e.clientX - rect.left - PAD.left) / g.innerW
    setMonth(Math.round(Math.min(1, Math.max(0, f)) * months))
  }

  function key(e: React.KeyboardEvent<SVGSVGElement>) {
    const step = e.shiftKey ? 12 : 1
    const cur = hover ?? months
    if (e.key === "ArrowLeft") setMonth(Math.max(0, cur - step))
    else if (e.key === "ArrowRight") setMonth(Math.min(months, cur + step))
    else if (e.key === "Home") setMonth(0)
    else if (e.key === "End") setMonth(months)
    else if (e.key === "Escape") setMonth(null)
    else return
    e.preventDefault()
  }

  const hx = g && hover != null ? g.x(hover) : null
  const markerY = (p: Projection) => (g && hover != null ? g.y(p.points[hover]![kind]) : 0)
  const reachX = g && targetMonth != null && targetMonth > 0 && targetMonth <= months ? g.x(targetMonth) : null

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg
        width={width || "100%"}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="block touch-pan-y select-none rounded-md focus-visible:outline-none"
        onPointerMove={(e) => { if (e.pointerType === "mouse") pointer(e) }}
        onPointerDown={pointer}
        onPointerLeave={() => setMonth(null)}
        onPointerCancel={() => setMonth(null)}
        onKeyDown={key}
        onBlur={() => setMonth(null)}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pf-accent)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--pf-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {g ? (
          <>
            {g.yTicks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + g.innerW} y1={g.y(t)} y2={g.y(t)} stroke="var(--hair2)" strokeWidth={1} />
                <text x={PAD.left - 8} y={g.y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--fg3)" style={{ fontFamily: "var(--mono)" }}>{usdCompact(t)}</text>
              </g>
            ))}
            {g.yearTicks.map((t) => (
              <text key={t} x={g.x(t * 12)} y={height - 7} textAnchor={t === 0 ? "start" : t * 12 >= months - 1 ? "end" : "middle"} fontSize={11} fill="var(--fg3)" style={{ fontFamily: "var(--mono)" }}>
                {t === 0 ? "Now" : `${t}y`}
              </text>
            ))}

            {target > 0 ? (
              g.targetInFrame ? (
                <g>
                  <motion.line initial={false} animate={{ y1: g.y(target), y2: g.y(target) }} transition={spring} x1={PAD.left} x2={PAD.left + g.innerW} stroke="var(--fg2)" strokeWidth={1} strokeDasharray="4 5" />
                  <motion.text initial={false} animate={{ y: g.y(target) - 6 }} transition={spring} x={PAD.left + 4} textAnchor="start" fontSize={10.5} fill="var(--fg2)" style={{ fontFamily: "var(--mono)", letterSpacing: "0.08em" }}>
                    TARGET {usdCompact(target)}
                  </motion.text>
                </g>
              ) : (
                <text x={PAD.left + g.innerW} y={PAD.top + 10} textAnchor="end" fontSize={10.5} fill="var(--fg2)" style={{ fontFamily: "var(--mono)", letterSpacing: "0.08em" }}>
                  TARGET {usdCompact(target)} ↑ OFF CHART
                </text>
              )
            ) : null}

            <motion.path initial={false} animate={{ d: g.area }} transition={spring} fill={`url(#${fillId})`} />
            <motion.path initial={false} animate={{ d: g.cons }} transition={spring} fill="none" stroke="var(--fg3)" strokeOpacity={0.75} strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="1 4" strokeLinecap="round" />
            <motion.path initial={false} animate={{ d: g.opt }} transition={spring} fill="none" stroke="var(--fg3)" strokeOpacity={0.75} strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="5 4" />
            <motion.path
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ d: g.base, pathLength: 1 }}
              transition={{ d: spring, pathLength: { duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] } }}
              fill="none"
              stroke="var(--pf-accent)"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {reachX != null ? (
              <g>
                <line x1={reachX} x2={reachX} y1={g.y(target)} y2={height - PAD.bottom} stroke="var(--pf-accent)" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 3" />
                <circle cx={reachX} cy={g.y(target)} r={4} fill="var(--panel)" stroke="var(--pf-accent)" strokeWidth={2} />
              </g>
            ) : null}

            {hx != null && hover != null ? (
              <g pointerEvents="none">
                <line x1={hx} x2={hx} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--line)" strokeWidth={1} />
                <circle cx={hx} cy={markerY(set.optimistic)} r={3} fill="var(--panel)" stroke="var(--fg3)" strokeWidth={1.5} />
                <circle cx={hx} cy={markerY(set.conservative)} r={3} fill="var(--panel)" stroke="var(--fg3)" strokeWidth={1.5} />
                <circle cx={hx} cy={markerY(set.base)} r={5} fill="var(--pf-accent)" stroke="var(--panel)" strokeWidth={2} />
              </g>
            ) : null}
          </>
        ) : null}
      </svg>
      {g && hover != null ? (
        <span className="sr-only" aria-live="polite">{`Month ${hover}, ${duration(hover)}: base ${usd(set.base.points[hover]![kind])}`}</span>
      ) : null}
    </div>
  )
}
