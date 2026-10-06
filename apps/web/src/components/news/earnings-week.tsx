"use client"

import { useState } from "react"
import { CalendarDays, Clock, Moon, Sun } from "lucide-react"
import { Segmented } from "@web/components/ui/segmented"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { SectionCard } from "@web/components/ui/section-card"
import { slideStyle, useSlidingIndicator } from "@web/lib/use-sliding-indicator"
import { plural } from "@web/lib/plural"
import { cn } from "@web/lib/utils"
import type { EarningsDay } from "@web/lib/news-sample"

type Scope = "all" | "mine"

/**
 * A Monday-to-Friday strip of earnings days. The selection is one outline that
 * glides between days, and the day's reports fade in one after another.
 */
export function EarningsWeek({ label, days, initialDay, index, className }: { label: string; days: EarningsDay[]; initialDay: number; index: number; className?: string }) {
  const [selected, setSelected] = useState(initialDay)
  const [scope, setScope] = useState<Scope>("all")
  const strip = useSlidingIndicator<HTMLDivElement>(String(selected))

  const day = days[selected]!
  const reports = day.reports.filter((r) => scope === "all" || r.owned)
  const empty =
    scope === "mine" && day.reports.length
      ? { title: "None of your holdings report", body: "Switch to All to see every company." }
      : { title: "No major reports", body: "Nothing notable is scheduled." }
  // Only the sample knows whether a date is confirmed; the live calendar doesn't say.
  const showStatus = days.some((d) => d.reports.some((r) => r.confirmed !== undefined))
  return (
    <SectionCard
      label="Upcoming earnings"
      className={className}
      icon={<CalendarDays />}
      tone="blue"
      index={index}
      action={
        <Segmented<Scope>
          label="Companies"
          size="sm"
          options={[
            { value: "all", label: "All" },
            { value: "mine", label: "My holdings" },
          ]}
          value={scope}
          onChange={setScope}
        />
      }
    >
      <div className="flex flex-col gap-3 px-5 pb-3.5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <div ref={strip.containerRef} className="relative grid grid-cols-5 gap-1.5 sm:gap-2">
          {/* The selection ring slides between days rather than jumping. */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-20 rounded-xl ring-2 ring-foreground" style={slideStyle(strip.rect, strip.ready)} />
          {days.map((d, i) => {
            const count = d.reports.filter((r) => scope === "all" || r.owned).length
            const owns = d.reports.some((r) => r.owned)
            return (
              <button
                key={d.iso ?? d.date}
                type="button"
                data-slide-key={String(i)}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
                className={cn(
                  "press relative flex min-h-[84px] flex-col gap-0.5 rounded-xl border p-2 text-left transition-colors hover:border-foreground/30 sm:p-3",
                  d.past ? "bg-muted/60" : "bg-card",
                )}
              >
                <span className={cn("text-xs font-medium", d.today ? "text-primary" : "text-muted-foreground")}>{d.dow}</span>
                <span className="numeric font-display text-2xl font-semibold leading-tight">{d.date}</span>
                <span className="mt-auto text-xs text-muted-foreground">
                  {/* Phones get the bare count; five tiles leave no room for the word. */}
                  <span className="sm:hidden">{count || "—"}</span>
                  <span className="hidden sm:inline">{count ? plural(count, "report") : "None"}</span>
                </span>
                {owns && <span title="Includes a company you own" className="absolute right-2.5 top-2.5 size-[7px] rounded-full bg-primary" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className={cn("hidden gap-3 border-t px-5 py-2 text-xs text-muted-foreground sm:grid", showStatus ? "grid-cols-[minmax(0,1fr)_128px_88px_92px]" : "grid-cols-[minmax(0,1fr)_128px_88px]")}>
        <span>{day.label}</span>
        <span>Reports</span>
        <span className="text-right">EPS est.</span>
        {showStatus ? <span className="text-right">Date</span> : null}
      </div>
      <ul key={`${selected}-${scope}`} className="flex-1">
        {reports.map((r, i) => (
          <li
            key={r.symbol}
            className={cn(
              "swap-in grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-3 sm:px-5",
              showStatus ? "sm:grid-cols-[minmax(0,1fr)_128px_88px_92px]" : "sm:grid-cols-[minmax(0,1fr)_128px_88px]",
            )}
            style={{ animationDelay: `${i * 55}ms` }}
          >
            <span className="flex min-w-0 items-center gap-3">
              <TickerLogo imageEnabled={false} symbol={r.symbol} size="sm" className="size-9 rounded-full" />
              <span className="flex min-w-0 flex-col">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  {r.symbol}
                  {r.owned && <span className="rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-foreground">You own</span>}
                </span>
                {r.name ? <span className="truncate text-[13px] text-muted-foreground">{r.name}</span> : null}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              {r.when === "before-open" ? <Sun className="h-3.5 w-3.5" aria-hidden /> : r.when === "after-close" ? <Moon className="h-3.5 w-3.5" aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}
              {r.when === "before-open" ? "Before open" : r.when === "after-close" ? "After close" : r.when === "during" ? "During market" : "Time not set"}
            </span>
            <span className="numeric hidden text-right text-sm font-medium sm:block">{r.epsEstimate}</span>
            {showStatus ? (
              <span className="hidden text-right sm:block">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.confirmed ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                  {r.confirmed ? "Confirmed" : "Estimated"}
                </span>
              </span>
            ) : null}
          </li>
        ))}
        {reports.length === 0 && (
          <li className="swap-in flex flex-col items-center gap-1 border-t px-5 py-7 text-center">
            <span className="text-sm font-semibold">{empty.title}</span>
            <span className="text-[13px] text-muted-foreground">{empty.body}</span>
          </li>
        )}
      </ul>
      <p className="border-t px-5 pb-4 pt-3 text-xs text-muted-foreground">Times in ET. Dates can move until the company confirms them.</p>
    </SectionCard>
  )
}
