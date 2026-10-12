"use client"

import { useEffect, useState } from "react"
import { formatPercent } from "@web/lib/format"
import { SectionCard } from "@web/components/ui/section-card"
import { cn } from "@web/lib/utils"
import type { Period, SectorMove } from "@web/lib/news-sample"

/**
 * Sectors as bars either side of zero, best first. Bars grow out from the
 * centre line on arrival and re-measure smoothly when the period changes; rows
 * that swap places on a re-sort slide to their new spot.
 */
export function SectorBars({ sectors, period, index }: { sectors: SectorMove[]; period: Period; index: number }) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // A sector whose week can't be measured is left out of the week view rather than shown as flat.
  const rows = sectors.flatMap(([name, day, week]) => {
    const value = period === "day" ? day : week
    return value == null ? [] : [{ name, value }]
  })
  const order = [...rows].sort((a, b) => b.value - a.value).map((r) => r.name)
  const max = Math.max(0.01, ...rows.map((r) => Math.abs(r.value)))
  const ROW = 34

  return (
    <SectionCard label="Sectors at a glance" index={index} action={<span className="nw-end">{period === "day" ? "Today" : "This week"}</span>}>
      <ol className="nw-sectors" style={{ minHeight: rows.length * ROW }}>
        {rows.map((r) => (
          <li key={r.name} className="nw-sector" style={{ top: order.indexOf(r.name) * ROW, height: ROW }}>
            <span title={r.name}>{r.name}</span>
            <div>
              <i className={r.value >= 0 ? "pos" : "neg"} style={{ width: `${grown ? (Math.abs(r.value) / max) * 50 : 0}%` }} />
            </div>
            <b className={cn("numeric", r.value >= 0 ? "text-gain-ink" : "text-loss-ink")}>{formatPercent(r.value)}</b>
          </li>
        ))}
      </ol>
      <SectorSummary rows={rows} period={period} />
      <div className="nw-lead">
        <span>
          Leader <b className="text-gain-ink">{order[0]}</b>
        </span>
        <span>
          Laggard <b className="text-loss-ink">{order[order.length - 1]}</b>
        </span>
        <span className="nw-lead-end">S&amp;P 500 sectors</span>
      </div>
    </SectionCard>
  )
}

/** Defensive sectors hold up when investors get cautious; cyclicals lead when they're confident. */
const DEFENSIVE = new Set(["Utilities", "Consumer staples", "Health care", "Real estate"])

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)

/**
 * Two readings from the same numbers: how broad the move was (sectors up
 * against down) and whether money leaned defensive or cyclical.
 */
function SectorSummary({ rows, period }: { rows: { name: string; value: number }[]; period: Period }) {
  if (rows.length < 4) return null
  const up = rows.filter((r) => r.value > 0).length
  const down = rows.filter((r) => r.value < 0).length
  const defensive = average(rows.filter((r) => DEFENSIVE.has(r.name)).map((r) => r.value))
  const cyclical = average(rows.filter((r) => !DEFENSIVE.has(r.name)).map((r) => r.value))
  const gap = cyclical - defensive
  const lean = Math.abs(gap) < 0.15 ? "No clear tilt between defensive and cyclical sectors" : gap > 0 ? "Cyclicals led: investors leaned into growth" : "Defensives led: investors leaned cautious"
  const breadth = up === rows.length ? "Every sector rose" : down === rows.length ? "Every sector fell" : `${up} of ${rows.length} sectors rose`
  return (
    <div className="nw-summary">
      <div>
        <div className="nw-row">
          <b>Breadth</b>
          <span>
            {breadth} {period === "day" ? "today" : "this week"}
          </span>
        </div>
        <div className="nw-breadth" role="img" aria-label={`${up} sectors up, ${down} down`}>
          {up > 0 ? <span className="up" style={{ flex: up }} /> : null}
          {rows.length - up - down > 0 ? <span className="flat" style={{ flex: rows.length - up - down }} /> : null}
          {down > 0 ? <span className="down" style={{ flex: down }} /> : null}
        </div>
      </div>
      <div className="nw-two">
        <div>
          <span>Cyclical sectors</span>
          <b className={cn("numeric", cyclical >= 0 ? "text-gain-ink" : "text-loss-ink")}>{formatPercent(cyclical)} avg</b>
        </div>
        <div>
          <span>Defensive sectors</span>
          <b className={cn("numeric", defensive >= 0 ? "text-gain-ink" : "text-loss-ink")}>{formatPercent(defensive)} avg</b>
        </div>
      </div>
      <p>{lean}.</p>
    </div>
  )
}
