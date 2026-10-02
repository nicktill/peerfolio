"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, PieChart } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { colorForIndex, type AllocationSlice } from "@web/components/charts/allocation-bar"
import { formatCurrency, formatPercent } from "@web/lib/format"
import { cn } from "@web/lib/utils"
import { roundToTotal, withShownWeights } from "@web/lib/percent-display"

export type HoldingRow = {
  securityId: string
  ticker: string | null
  name: string | null
  type: string | null
  quantity: number
  value: number
  weight: number
  todayAmount: number | null
  todayPercent: number | null
  gainAmount: number | null
  gainPercent: number | null
  positions: number
}

type Sort = "value" | "gain" | "today"
const SORTS = [
  { value: "value", label: "Value" },
  { value: "gain", label: "Gain" },
  { value: "today", label: "Today" },
] as const

/** Rows shown before "Show all", so a hundred holdings don't become a hundred rows of scrolling. */
const PREVIEW = 12
const OPEN_KEY = "peerfolio:holdings-open"

const signed = (v: number, hidden: boolean) =>
  hidden ? "••••" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatCurrency(Math.abs(v))}`

const tone = (v: number | null) => (v == null || v === 0 ? "text-muted-foreground" : v > 0 ? "text-gain-ink" : "text-loss-ink")

/**
 * The line under a holding's value on phones, where there's no room for the
 * Today and Total return columns: the metric the sort is on, with its percent
 * and dollar amount from the same period. "Value" shows today's move.
 */
function MobileMetric({ h, sort, hidden }: { h: HoldingRow; sort: Sort; hidden: boolean }) {
  const gain = sort === "gain"
  const percent = gain ? h.gainPercent : h.todayPercent
  const amount = gain ? h.gainAmount : h.todayAmount
  if (percent == null && amount == null) {
    return <p className="numeric text-xs text-muted-foreground md:hidden">{gain ? "no avg cost" : "—"}</p>
  }
  return (
    <p className={cn("numeric text-xs md:hidden", tone(percent ?? amount))}>
      {[percent != null ? formatPercent(percent, gain ? 1 : 2) : null, amount != null ? signed(amount, hidden) : null].filter(Boolean).join(" · ")}
    </p>
  )
}

/**
 * Every holding as one row per security (the same fund in two accounts is one
 * line), sortable by value, gain or today's move. The allocation mix is a thin
 * bar on top instead of a card of its own.
 */
export function HoldingsTable({
  holdings,
  allocation,
  hidden,
  todayLabel,
}: {
  holdings: HoldingRow[]
  allocation: AllocationSlice[]
  hidden: boolean
  /** What to call the "Today" column: "Today", or the date when the market hasn't traded today. */
  todayLabel: string
}) {
  const [sort, setSort] = useState<Sort>("value")
  const [showAll, setShowAll] = useState(false)
  // Open by default; a person's choice is remembered on this device (best effort).
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(OPEN_KEY) === "0") setOpen(false)
    } catch {
      // Storage can be unavailable (private windows); the card just stays open.
    }
  }, [])
  function toggle() {
    setOpen((v) => {
      try {
        window.localStorage.setItem(OPEN_KEY, v ? "0" : "1")
      } catch {
        // Not remembering is fine.
      }
      return !v
    })
  }

  const sorted = useMemo(() => {
    const key = (h: HoldingRow) => (sort === "value" ? h.value : sort === "gain" ? h.gainPercent : h.todayPercent)
    // Unknowns go last in either direction so a sort never buries real numbers.
    return [...holdings].sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity))
  }, [holdings, sort])

  const sortOptions: { value: Sort; label: string }[] = SORTS.map((s) => (s.value === "today" ? { value: s.value, label: todayLabel } : { value: s.value, label: s.label }))
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW)

  if (holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={PieChart} title="No holdings yet" description="Add positions to an account and they’ll show up here." />
        </CardContent>
      </Card>
    )
  }

  const slices = allocation.slice(0, 5)
  const shownSlices = roundToTotal(slices.map((s) => s.percent))
  // Row weights are rounded together across every holding, so the column adds up to 100.0%.
  const shownWeight = new Map(withShownWeights(holdings, 1).map((h) => [h.securityId, h.shownWeight]))
  const maxWeight = Math.max(...holdings.map((h) => h.weight), 1)

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-3">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="holdings-body" className="flex items-center gap-3 rounded-md text-left">
          <CardTitle>Holdings</CardTitle>
          <span className="numeric text-sm text-muted-foreground">{holdings.length}</span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden />
        </button>
        {open ? (
          <Segmented<Sort> options={sortOptions} value={sort} onChange={setSort} size="sm" label="Sort holdings" className="ml-auto" />
        ) : (
          <p className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
            {sorted.slice(0, 4).map((h) => h.ticker ?? h.name ?? "?").join(" · ")}
            {sorted.length > 4 ? ` · +${sorted.length - 4} more` : ""}
          </p>
        )}
      </CardHeader>

      <CardContent id="holdings-body" hidden={!open}>
        {slices.length > 0 ? (
          <div className="mb-2">
            <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={slices.map((s, i) => `${s.name} ${shownSlices[i]} percent`).join(", ")}>
              {slices.map((s, i) => (
                <div key={s.name} className="h-full rounded-full" style={{ width: `${Math.max(s.percent, 1)}%`, backgroundColor: colorForIndex(i) }} />
              ))}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {slices.map((s, i) => (
                <span key={s.name} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px]" style={{ backgroundColor: colorForIndex(i) }} aria-hidden />
                  {s.name} <b className="numeric font-semibold text-foreground">{`${shownSlices[i]}%`}</b>
                </span>
              ))}
            </p>
          </div>
        ) : null}

        <div className="mt-4 hidden grid-cols-[minmax(0,2fr)_minmax(140px,0.9fr)_minmax(90px,0.65fr)_minmax(90px,0.7fr)_minmax(95px,0.75fr)] gap-4 border-b pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Name</span>
          <span>Weight</span>
          <span className="text-right">Value</span>
          <span className="text-right">{todayLabel}</span>
          <span className="text-right">Total return</span>
        </div>

        <ul className="divide-y">
          {visible.map((h) => (
            <li key={h.securityId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-3 md:grid-cols-[minmax(0,2fr)_minmax(140px,0.9fr)_minmax(90px,0.65fr)_minmax(90px,0.7fr)_minmax(95px,0.75fr)]">
              <div className="flex min-w-0 items-center gap-3">
                <TickerLogo symbol={h.ticker ?? "?"} kind={h.type === "cryptocurrency" ? "crypto" : "stock"} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{h.ticker ?? h.name ?? "Position"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {h.name ?? ""}
                    {h.positions > 1 ? ` · ${h.positions} accounts` : ""}
                  </p>
                </div>
              </div>

              <div className="hidden items-center gap-3 md:flex">
                <span className="numeric w-11 text-sm">{`${shownWeight.get(h.securityId) ?? h.weight.toFixed(1)}%`}</span>
                <span className="h-1 flex-1 rounded-full bg-muted">
                  <span className="block h-1 rounded-full bg-muted-foreground/70" style={{ width: `${Math.max((h.weight / maxWeight) * 100, 2)}%` }} />
                </span>
              </div>

              <div className="text-right">
                <p className="numeric text-sm font-semibold">{formatCurrency(h.value, { hidden })}</p>
                <MobileMetric h={h} sort={sort} hidden={hidden} />
              </div>

              <div className="hidden text-right md:block">
                {h.todayPercent != null ? (
                  <>
                    <p className={cn("numeric text-sm font-semibold", tone(h.todayPercent))}>{formatPercent(h.todayPercent, 2)}</p>
                    <p className={cn("numeric text-xs", tone(h.todayAmount))}>{h.todayAmount != null ? signed(h.todayAmount, hidden) : ""}</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>

              <div className="hidden text-right md:block">
                {h.gainPercent != null ? (
                  <>
                    <p className={cn("numeric text-sm font-semibold", tone(h.gainPercent))}>{formatPercent(h.gainPercent, 1)}</p>
                    <p className="numeric text-xs text-muted-foreground">{h.gainAmount != null ? signed(h.gainAmount, hidden) : ""}</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">no avg cost</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {sorted.length > PREVIEW ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 w-full rounded-lg py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            {showAll ? "Show fewer" : `Show all ${sorted.length} holdings`}
          </button>
        ) : null}
      </CardContent>
    </Card>
  )
}
