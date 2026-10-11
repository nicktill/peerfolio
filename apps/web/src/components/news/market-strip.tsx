"use client"

import { useId } from "react"
import { Delta } from "@web/components/ui/delta"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { revealStyle } from "@web/components/motion/reveal"
import { cn } from "@web/lib/utils"
import type { IndexQuote, Period } from "@web/lib/news-sample"

const W = 240
const H = 48
const PAD = 6

/** The path spread across the full width; the dot's position is returned as a share so it can sit in HTML and stay round at any width. */
function geometry(path: number[]) {
  if (path.length < 2) path = [0, ...path, ...(path.length ? [] : [0])]
  const lo = Math.min(0, ...path)
  const hi = Math.max(0, ...path)
  const span = hi - lo || 1
  const x = (i: number) => (i * W) / (path.length - 1)
  const y = (v: number) => PAD + ((hi - v) / span) * (H - PAD * 2)
  const line = path.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")
  const end = { x: x(path.length - 1), y: y(path[path.length - 1]!) }
  return { line, area: `${line} L${end.x.toFixed(1)} ${H} L0 ${H} Z`, zero: y(0), end }
}

const price = (v: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const points = (v: number) => `${v >= 0 ? "+" : "−"}${price(Math.abs(v))}`

function IndexCard({ quote, period, index }: { quote: IndexQuote; period: Period; index: number }) {
  const gradient = useId()
  const move = quote[period]
  const g = move ? geometry(move.path) : null
  const up = !move || move.percent >= 0
  const color = up ? "var(--gain)" : "var(--loss)"
  const fund = quote.symbol ? `Tracked by the ${quote.symbol} fund` : undefined

  return (
    <article className="nw-tile reveal" style={revealStyle(index)} aria-label={quote.name}>
      <div className="nw-tile-title">
        <span title={fund}>
          {quote.name}
          {quote.symbol ? <small className="numeric">{quote.symbol}</small> : null}
        </span>
        {move ? <Delta value={move.percent} size="sm" variant="plain" /> : null}
      </div>
      <AnimatedNumber value={quote.price} format={quote.symbol ? (v) => `$${price(v)}` : price} className="nw-tile-px numeric" />
      {move && g ? (
        <>
          <span className="nw-tile-sub numeric">
            {quote.symbol ? `${points(move.points).replace(/^([+−])/, "$1$")}` : points(move.points)} {period === "day" ? "today" : "this week"}
          </span>
          {/* Keyed on the period so the line draws itself again when you switch. */}
          <div key={period} className="nw-spark" style={{ color }} aria-hidden>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="currentColor" stopOpacity={0.24} />
                  <stop offset="1" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <line x1={0} x2={W} y1={g.zero} y2={g.zero} stroke="var(--hair)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              <path d={g.area} fill={`url(#${gradient})`} />
              <path d={g.line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <i style={{ left: `${(g.end.x / W) * 100}%`, top: `${(g.end.y / H) * 100}%` }} />
          </div>
        </>
      ) : (
        // The week can't be measured without enough daily bars; say so rather than show the day's move under a week label.
        <>
          <span className="nw-tile-sub">This week’s move isn’t available yet.</span>
          <div className="nw-spark" aria-hidden />
        </>
      )}
    </article>
  )
}

/** Four index tiles, each with the period's path drawn as an area sparkline. */
export function MarketStrip({ quotes, period, startIndex = 0 }: { quotes: IndexQuote[]; period: Period; startIndex?: number }) {
  return (
    // As many columns as there are tiles, so a missing index never leaves a hole.
    <div className={cn("nw-tiles")} style={{ "--n": quotes.length } as React.CSSProperties}>
      {quotes.map((q, i) => (
        <IndexCard key={q.key} quote={q} period={period} index={startIndex + i} />
      ))}
    </div>
  )
}
