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
      <ol className="relative mx-5 my-2.5 flex-1" style={{ minHeight: rows.length * ROW }}>
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
