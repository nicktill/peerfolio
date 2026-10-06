"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, PieChart, Search } from "lucide-react"
import { Card, CardContent } from "@web/components/ui/card"
import { SectionLabel } from "@web/components/ui/section-card"
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
  variant = "card",
}: {
  holdings: HoldingRow[]
  allocation: AllocationSlice[]
  hidden: boolean
  /** What to call the "Today" column: "Today", or the date when the market hasn't traded today. */
  todayLabel: string
  /** "section": open on the page under a hairline, with a search box, instead of a collapsible card. */
  variant?: "card" | "section"
}) {
  const [sort, setSort] = useState<Sort>("value")
  const [query, setQuery] = useState("")
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
    const q = query.trim().toLowerCase()
    const matching = q ? holdings.filter((h) => `${h.ticker ?? ""} ${h.name ?? ""}`.toLowerCase().includes(q)) : holdings
    return [...matching].sort((a, b) => (key(b) ?? -Infinity) - (key(a) ?? -Infinity))
  }, [holdings, sort, query])

  const sortOptions: { value: Sort; label: string }[] = SORTS.map((s) => (s.value === "today" ? { value: s.value, label: todayLabel } : { value: s.value, label: s.label }))
  const visible = showAll || query ? sorted : sorted.slice(0, PREVIEW)

  if (holdings.length === 0) {
    return (
      <Card>
        <div className="flex min-h-[52px] items-center border-b py-2.5 pl-5 pr-3">
          <SectionLabel>Holdings</SectionLabel>
        </div>
        <CardContent className="pt-5">
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

  // The allocation bar and rows, shared by both layouts.
  const content = (
    <>
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

        {sorted.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No holdings match “{query}”.</p> : null}

        {!query && sorted.length > PREVIEW ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 w-full rounded-lg py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            {showAll ? "Show fewer" : `Show all ${sorted.length} holdings`}
          </button>
        ) : null}
    </>
  )

  const sortControl = <Segmented<Sort> options={sortOptions} value={sort} onChange={setSort} size="sm" label="Sort holdings" />

  if (variant === "section") {
    return (
      <section aria-labelledby="holdings-title" className="border-t pt-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="holdings-title" className="text-base font-semibold">
              Holdings <span className="numeric font-normal text-muted-foreground">{holdings.length}</span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">One view across your accounts.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 rounded-lg border bg-background/60 px-3 transition-colors focus-within:border-foreground/30">
              <Search className="size-3.5 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find a holding"
                placeholder="Find a holding"
                className="w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:w-44"
              />
            </label>
            {sortControl}
          </div>
        </div>
        <div>
        {content}
        </div>
      </section>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className={cn("flex min-h-[52px] flex-wrap items-center gap-3 py-2.5 pl-5 pr-3", open && "border-b")}>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="holdings-body" className="group flex items-center gap-1.5 rounded-md text-left">
          <SectionLabel as="span" className="transition-colors group-hover:text-foreground">{`Holdings · ${holdings.length}`}</SectionLabel>
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform duration-300", !open && "-rotate-90")} aria-hidden />
        </button>
        {open ? (
          <div className="ml-auto">{sortControl}</div>
        ) : (
          <p className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
            {sorted.slice(0, 4).map((h) => h.ticker ?? h.name ?? "?").join(" · ")}
            {sorted.length > 4 ? ` · +${sorted.length - 4} more` : ""}
          </p>
        )}
      </div>

      <CardContent id="holdings-body" hidden={!open} className="pt-4">
        {content}
      </CardContent>
    </Card>
  )
}
