"use client"

import { useId } from "react"
import { Card } from "@web/components/ui/card"
import { TiltCard } from "@web/components/ui/tilt-card"
import { Delta } from "@web/components/ui/delta"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { revealStyle } from "@web/components/motion/reveal"
import { cn } from "@web/lib/utils"
import type { IndexQuote, Period } from "@web/lib/news-sample"

const W = 240
const H = 64

function geometry(path: number[]) {
  if (path.length < 2) path = [0, ...path, ...(path.length ? [] : [0])]
  const lo = Math.min(0, ...path)
  const hi = Math.max(0, ...path)
  const span = hi - lo || 1
  const x = (i: number) => 6 + (i * (W - 14)) / (path.length - 1)
  const y = (v: number) => 8 + ((hi - v) / span) * (H - 16)
  const line = path.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")
  const end = { x: x(path.length - 1), y: y(path[path.length - 1]!) }
  return { line, area: `${line} L${end.x.toFixed(1)} ${H} L6 ${H} Z`, zero: y(0), end }
}

const price = (v: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const points = (v: number) => `${v >= 0 ? "+" : "−"}${price(Math.abs(v))}`

function IndexCard({ quote, period, index }: { quote: IndexQuote; period: Period; index: number }) {
  const gradient = useId()
  const move = quote[period]
  if (!move) {
    // The week can't be measured without enough daily bars; say so rather than show the day's move under a week label.
    return (
      <TiltCard className="h-full" style={revealStyle(index)}>
      <Card className="stat-card reveal flex h-full flex-col gap-1 p-3.5">
        <Name quote={quote} />
        <AnimatedNumber value={quote.price} format={price} className="numeric text-[21px] font-semibold tracking-tight" />
        <span className="text-xs text-muted-foreground">This week’s move isn’t available yet.</span>
      </Card>
      </TiltCard>
    )
  }
  const g = geometry(move.path)
  const color = move.percent >= 0 ? "var(--gain)" : "var(--loss)"

  return (
    <TiltCard className="h-full" style={revealStyle(index)}>
    <Card className={cn("stat-card reveal group flex h-full flex-col gap-1 p-3.5 pb-2", move.percent >= 0 ? "stat-card-up" : "stat-card-down")}>
      <div className="flex items-center justify-between gap-2">
        <Name quote={quote} />
        <Delta value={move.percent} size="sm" />
      </div>
      <AnimatedNumber value={quote.price} format={quote.symbol ? (v) => `$${price(v)}` : price} className="numeric text-[21px] font-semibold tracking-tight" />
      <span className="numeric text-xs text-muted-foreground">
        {quote.symbol ? `${points(move.points).replace(/^([+−])/, "$1$")}` : points(move.points)} {period === "day" ? "today" : "this week"}
      </span>
      {/* Keyed on the period so the line draws itself again when you switch. */}
      <svg key={period} viewBox={`0 0 ${W} ${H}`} className="mt-1 block h-auto w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.24} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={0} x2={W} y1={g.zero} y2={g.zero} stroke="hsl(var(--border))" strokeDasharray="3 4" />
        <path d={g.area} fill={`url(#${gradient})`} className="race-area" />
        <path d={g.line} pathLength={1} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="race-line" />
        <circle cx={g.end.x} cy={g.end.y} r={6} fill={color} opacity={0.2} className="race-end origin-center [transform-box:fill-box] group-hover:animate-ping" />
        <circle cx={g.end.x} cy={g.end.y} r={3} fill={color} className="race-end" />
      </svg>
    </Card>
    </TiltCard>
  )
}

/** The index's name, and the fund the numbers come from when they're live. */
function Name({ quote }: { quote: IndexQuote }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 truncate text-[13px] font-medium text-muted-foreground" title={quote.symbol ? `Tracked by the ${quote.symbol} fund` : undefined}>
      {quote.name}
      {quote.symbol ? <span className="font-mono text-[11px] text-muted-foreground/80">{quote.symbol}</span> : null}
    </span>
  )
}

/** Four index cards, each with the period's path drawn as an area sparkline. */
export function MarketStrip({ quotes, period, startIndex = 0 }: { quotes: IndexQuote[]; period: Period; startIndex?: number }) {
  return (
    // As many columns as there are cards, so a missing index never leaves a hole.
    <div className={cn("grid grid-cols-2 gap-3", quotes.length === 4 ? "lg:grid-cols-4" : quotes.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
      {quotes.map((q, i) => (
        <IndexCard key={q.key} quote={q} period={period} index={startIndex + i} />
      ))}
    </div>
  )
}
