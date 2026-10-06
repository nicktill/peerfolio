"use client"

import { useEffect, useState } from "react"
import { formatPercent } from "@web/lib/format"
import { LayoutGrid } from "lucide-react"
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
    <SectionCard label="Sectors at a glance" icon={<LayoutGrid />} tone="orange" index={index} action={<span className="pr-2 text-xs text-muted-foreground">{period === "day" ? "Today" : "This week"}</span>}>
      <ol className="relative mx-5 my-2.5" style={{ minHeight: rows.length * ROW }}>
        {rows.map((r) => {
          const width = grown ? (Math.abs(r.value) / max) * 50 : 0
          return (
            <li
              key={r.name}
              className="absolute inset-x-0 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_62px] items-center gap-2.5 transition-[top] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ top: order.indexOf(r.name) * ROW, height: ROW }}
            >
              <span className="truncate text-[13px]">{r.name}</span>
              <span className="relative h-2 rounded-full bg-muted">
                <span className="absolute -top-0.5 left-1/2 h-3 w-px bg-border" />
                <span
                  className={cn("stat-bar absolute top-0 h-full rounded-full", r.value >= 0 ? "left-1/2 bg-gain" : "right-1/2 bg-loss")}
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className={cn("numeric text-right text-[13px] font-semibold", r.value >= 0 ? "text-gain-ink" : "text-loss-ink")}>{formatPercent(r.value)}</span>
            </li>
          )
        })}
      </ol>
      <SectorSummary rows={rows} period={period} />
      <div className="flex flex-wrap gap-4 border-t px-5 pb-4 pt-3 text-xs text-muted-foreground">
        <span>
          Leader <strong className="font-semibold text-gain-ink">{order[0]}</strong>
        </span>
        <span>
          Laggard <strong className="font-semibold text-loss-ink">{order[order.length - 1]}</strong>
        </span>
        <span className="ml-auto">S&amp;P 500 sectors</span>
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
    <div className="mt-auto flex flex-col gap-3 border-t px-5 py-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="font-semibold">Breadth</span>
          <span className="text-muted-foreground">
            {breadth} {period === "day" ? "today" : "this week"}
          </span>
        </div>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${up} sectors up, ${down} down`}>
          {up > 0 ? <span className="bg-gain" style={{ flex: up }} /> : null}
          {rows.length - up - down > 0 ? <span className="bg-muted-foreground/40" style={{ flex: rows.length - up - down }} /> : null}
          {down > 0 ? <span className="bg-loss" style={{ flex: down }} /> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/60 px-3 py-2.5">
          <span className="block text-xs text-muted-foreground">Cyclical sectors</span>
          <span className={cn("numeric text-sm font-semibold", cyclical >= 0 ? "text-gain-ink" : "text-loss-ink")}>{formatPercent(cyclical)} avg</span>
        </div>
        <div className="rounded-xl bg-muted/60 px-3 py-2.5">
          <span className="block text-xs text-muted-foreground">Defensive sectors</span>
          <span className={cn("numeric text-sm font-semibold", defensive >= 0 ? "text-gain-ink" : "text-loss-ink")}>{formatPercent(defensive)} avg</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{lean}.</p>
    </div>
  )
}
