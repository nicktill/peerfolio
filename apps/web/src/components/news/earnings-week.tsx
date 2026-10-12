"use client"

import { useState } from "react"
import { Clock, Moon, Sun } from "lucide-react"
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
      <div className="nw-wk">
        <b>{label}</b>
        <div ref={strip.containerRef} className="nw-days">
          {/* The selection ring slides between days rather than jumping. */}
          <span aria-hidden className="nw-ring" style={slideStyle(strip.rect, strip.ready)} />
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
                className={cn("nw-day press", d.today && "today", d.past && "past")}
              >
                <span className="dow">{d.dow}</span>
                <span className="dn numeric">{d.date}</span>
                <span className="ct">
                  {/* Phones get the bare count; five tiles leave no room for the word. */}
                  <span className="nw-only-xs">{count || "—"}</span>
                  <span className="nw-hide-xs">{count ? plural(count, "report") : "None"}</span>
                </span>
                {owns && <span title="Includes a company you own" className="own" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className={cn("nw-cols", showStatus && "status")}>
        <span>{day.label}</span>
        <span>Reports</span>
        <span className="r">EPS est.</span>
        {showStatus ? <span className="r">Date</span> : null}
      </div>
      <ul key={`${selected}-${scope}`}>
        {reports.map((r, i) => (
          <li key={r.symbol} className={cn("swap-in nw-earn", showStatus && "status")} style={{ animationDelay: `${i * 55}ms` }}>
            <span className="nw-earn-co">
              <TickerLogo symbol={r.symbol} size="sm" className="size-9 rounded-full" />
              <span>
                <span className="pf-t1">
                  {r.symbol}
                  {r.owned && <span className="nw-own">You own</span>}
                </span>
                {r.name ? <span className="nw-earn-name">{r.name}</span> : null}
              </span>
            </span>
            <span className="nw-when">
              {r.when === "before-open" ? <Sun aria-hidden /> : r.when === "after-close" ? <Moon aria-hidden /> : <Clock aria-hidden />}
              {r.when === "before-open" ? "Before open" : r.when === "after-close" ? "After close" : r.when === "during" ? "During market" : "Time not set"}
            </span>
            <span className="nw-eps numeric">{r.epsEstimate}</span>
            {showStatus ? (
              <span className="nw-stat">
                <span className={cn("pf-chip", r.confirmed && "on")}>{r.confirmed ? "Confirmed" : "Estimated"}</span>
              </span>
            ) : null}
          </li>
        ))}
        {reports.length === 0 && (
          <li className="swap-in nw-empty" style={{ borderTop: "1px solid var(--hair2)" }}>
            <b>{empty.title}</b>
            <p>{empty.body}</p>
          </li>
        )}
      </ul>
      <p className="pf-foot">Times in ET. Dates can move until the company confirms them.</p>
    </SectionCard>
  )
}
