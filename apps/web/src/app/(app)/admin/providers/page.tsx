"use client"

import { useEffect, useState } from "react"
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card } from "@web/components/ui/card"
import { CollapsibleCard } from "@web/components/ui/collapsible-card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { StatTile } from "@web/components/ui/stat-tile"
import { GroupedBarChart, UsageLineChart } from "@web/components/charts/usage-chart"
import { useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import { BudgetHelp } from "./budget-help"
import { TickersSection } from "./tickers-section"
import { EventsSection, type EventFilter, type KindFilter } from "./events-section"
import { WARN_RATIO, type Dashboard, type ProviderDashboard, type RangeKey } from "@web/lib/provider-stats-core"

const RANGE_OPTIONS: readonly { value: RangeKey; label: string }[] = [
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
]

const COLORS: Record<string, string> = { alpaca: "var(--series-1)", finnhub: "var(--series-2)", massive: "var(--series-3)", tiingo: "var(--series-4)" }
const colorOf = (provider: string) => COLORS[provider] ?? "var(--series-5)"
const num = (n: number) => n.toLocaleString("en-US")
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`

function formatWhen(iso: string, range: RangeKey) {
  const d = new Date(iso)
  return range === "6h" || range === "24h"
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric", hour: range === "7d" ? "numeric" : undefined })
}

/** A bar filled to `ratio` of its limit; turns to the loss colour past the warning line. */
function Utilization({ label, value, detail, ratio }: { label: string; value: string; detail: string; ratio: number | null }) {
  const warn = ratio != null && ratio > WARN_RATIO
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("numeric font-medium", warn && "text-loss-ink")}>{value}<span className="ml-1.5 font-normal text-muted-foreground">{detail}</span></span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, ratio ?? 0) * 100)}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(1, ratio ?? 0) * 100}%`, background: warn ? "var(--loss)" : "var(--series-1)" }} />
      </div>
    </div>
  )
}

const dec = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 })
const rate = (r: number | null) => (r == null ? "–" : r >= 0.995 && r < 1 ? "99.5%+" : pct(r))

/** Plain-English reading of one provider's health. */
function reading(p: ProviderDashboard) {
  if (p.totals.requests === 0) return p.totals.denied > 0 ? `Nothing was sent: our budget refused ${num(p.totals.denied)}.` : "No requests in this range."
  const r = p.successRate ?? 0
  const head = r >= 0.98 ? "Healthy" : r >= 0.9 ? "Mostly healthy" : "Struggling"
  const batch = p.avgBatch != null ? `, ${dec(p.avgBatch)} ticker${p.avgBatch === 1 ? "" : "s"} per request` : ""
  const notes = [p.totals.rateLimited > 0 ? `${num(p.totals.rateLimited)} rate limited` : "", p.totals.denied > 0 ? `${num(p.totals.denied)} held back by our budget` : ""].filter(Boolean)
  const thin = p.avgBatch != null && p.avgBatch < 2 && p.totals.requests >= 50 ? " Requests carry few tickers each, so batching could save budget." : ""
  return `${head}: ${rate(p.successRate)} succeeded${batch}${notes.length ? `; ${notes.join(", ")}` : ""}.${thin}`
}

const OUTCOMES = [
  { key: "succeeded", label: "Succeeded", cls: "bg-gain" },
  { key: "denied", label: "Denied by our budget", cls: "bg-muted-foreground/40" },
  { key: "rateLimited", label: "Rate limited", cls: "bg-loss/60" },
  { key: "failed", label: "Failed", cls: "bg-loss" },
] as const

/** What happened to every attempt in range, as one stacked bar. Denied attempts never left our servers, so they count here but not in the success rate. */
function OutcomeBar({ p }: { p: ProviderDashboard }) {
  const values = { succeeded: p.succeeded, denied: p.totals.denied, rateLimited: p.totals.rateLimited, failed: p.totals.failed }
  const total = OUTCOMES.reduce((n, o) => n + values[o.key], 0)
  if (total === 0) return null
  const summary = OUTCOMES.map((o) => `${o.label} ${num(values[o.key])}`).join(", ")
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted-foreground">Outcomes <span className="numeric">({num(total)} attempts)</span></p>
      <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-secondary" role="img" aria-label={`Outcomes: ${summary}`}>
        {OUTCOMES.map((o) => (values[o.key] > 0 ? <div key={o.key} className={o.cls} style={{ width: `${(values[o.key] / total) * 100}%`, minWidth: 3 }} title={`${o.label}: ${num(values[o.key])}`} /> : null))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {OUTCOMES.map((o) => (
          <li key={o.key} className="flex items-center gap-1.5"><span aria-hidden className={cn("inline-block size-2 rounded-full", o.cls)} />{o.label} <span className="numeric font-medium text-foreground">{num(values[o.key])}</span></li>
        ))}
      </ul>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="numeric mt-0.5 font-display text-lg font-semibold tracking-[-0.02em]">{value}</p>
      {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h2>
}

function ProviderCard({ p, range }: { p: ProviderDashboard; range: RangeKey }) {
  const unit = p.limit.per === "hour" ? "hr" : "min"
  return (
    <CollapsibleCard
      storageKey={`providers-card-${p.provider}`}
      title={
        <h2 className="flex items-center gap-2 font-medium capitalize">
          <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: colorOf(p.provider) }} />{p.provider}
          {p.warn ? <span className="inline-flex items-center gap-1 rounded-full bg-loss/10 px-2 py-0.5 text-xs font-medium normal-case text-loss-ink"><AlertTriangle aria-hidden className="size-3" />Near limit</span> : null}
        </h2>
      }
      summary={p.totals.requests === 0 ? "No requests" : `${num(p.totals.requests)} requests · ${rate(p.successRate)}`}
    >
        <p className="flex items-start gap-1.5 text-sm"><CheckCircle2 aria-hidden className={cn("mt-0.5 size-4 shrink-0", p.totals.requests > 0 && (p.successRate ?? 0) >= 0.98 ? "text-gain-ink" : "text-muted-foreground")} />{reading(p)}</p>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Succeeded" value={num(p.succeeded)} hint={`of ${num(p.totals.requests)} sent`} />
          <Metric label="Success rate" value={rate(p.successRate)} />
          <Metric label="Tickers / request" value={p.avgBatch == null ? "–" : dec(p.avgBatch)} hint={`${num(p.totals.symbols)} tickers`} />
        </div>
        <OutcomeBar p={p} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Utilization label="Peak vs limit" value={`${num(p.peak.value)}/${unit}`} detail={`of ${num(p.limit.amount)} (${pct(p.peakRatio)})`} ratio={p.peakRatio} />
          <Utilization
            label="Last hour vs our budget"
            value={num(p.lastHour.requests)}
            detail={p.hourBudget ? `of ${num(p.hourBudget)} (${pct(p.lastHourRatio ?? 0)})` : "no budget"}
            ratio={p.lastHourRatio}
          />
        </div>
        <UsageLineChart
          points={p.series}
          limit={p.limit.amount}
          unit={unit}
          formatTime={(iso) => formatWhen(iso, range)}
          ariaLabel={`${p.provider} peak requests per ${p.limit.per} against its limit of ${p.limit.amount}`}
        />
        <p className="text-xs text-muted-foreground">
          {p.peak.at ? `Peak ${num(p.peak.value)}/${unit} at ${new Date(p.peak.at).toLocaleString()}. ` : ""}
          Rate limited means the provider said 429; denied means our own budget refused before sending.
        </p>
    </CollapsibleCard>
  )
}

export default function ProviderUsagePage() {
  const [range, setRange] = useState<RangeKey>("24h")
  const [eventFilter, setEventFilter] = useState<EventFilter>({ provider: "all", kind: "all" })
  const showEvents = (kind: KindFilter) => {
    setEventFilter({ provider: "all", kind })
    document.getElementById("events")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const { data, error, loading, refetch } = useApi<Dashboard>(`/api/admin/provider-stats?range=${range}`, [], { refreshMs: 60_000 })

  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (data) setUpdatedAt(Date.now())
  }, [data])
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000)
    return () => clearInterval(id)
  }, [])
  const updatedText = updatedAt == null ? null : (() => {
    void tick
    const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
    return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`
  })()

  const providers = data?.providers ?? []
  const sum = (pick: (p: ProviderDashboard) => number) => providers.reduce((n, p) => n + pick(p), 0)
  const sent = sum((p) => p.totals.requests)
  const succeeded = sum((p) => p.succeeded)
  const tickersSent = sum((p) => p.totals.symbols)
  const hottest = providers.reduce<ProviderDashboard | null>((best, p) => (p.peak.value > 0 && (!best || p.peakRatio > best.peakRatio) ? p : best), null)
  const warned = providers.filter((p) => p.warn)
  const dayCount = range === "30d" ? 30 : 7
  const days = (providers[0]?.days ?? []).slice(-dayCount)
  const dayLabels = days.map((d) => d.date)
  const seriesFor = (pick: (d: ProviderDashboard["days"][number]) => number) =>
    providers.map((p) => ({ key: p.provider, label: p.provider, color: colorOf(p.provider), values: p.days.slice(-dayCount).map(pick) }))

  return (
    <main className="mx-auto w-full max-w-5xl space-y-7 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight"><Activity aria-hidden className="size-6" />Provider usage</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Requests and tickers sent to each price provider.{updatedText ? <> Updated <span className="numeric">{updatedText}</span>, refreshes every minute.</> : " Refreshes every minute."}</p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented<RangeKey> label="Range" options={RANGE_OPTIONS} value={range} onChange={setRange} />
          <Button variant="outline" size="icon" onClick={() => void refetch()} aria-label="Refresh" title="Refresh"><RefreshCw aria-hidden className={cn("size-4", loading && "animate-spin")} /></Button>
        </div>
      </div>

      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
      {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading usage…</p> : null}

      {data && !data.hasData ? (
        <Card><EmptyState icon={Activity} title="No data yet" description="Metrics start collecting after this deploys. Check back after the next price refresh." /></Card>
      ) : null}

      {data?.hasData ? (
        <>
          {warned.length ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-loss/40 bg-loss/10 p-4 text-sm text-loss-ink">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>{warned.map((p) => `${p.provider} peaked at ${pct(p.peakRatio)} of its limit`).join(" · ")}. Over {pct(WARN_RATIO)} leaves little room before requests are refused.</span>
            </div>
          ) : null}

          <section aria-labelledby="kpi-healthy">
            <SectionLabel><span id="kpi-healthy">Healthy</span></SectionLabel>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile label="Succeeded" value={num(succeeded)} hint={`of ${num(sent)} sent, last ${range}`} />
              <StatTile label="Success rate" value={sent > 0 ? rate(succeeded / sent) : "–"} hint="answered with data" className={sent > 0 && succeeded / sent >= 0.98 ? "border-gain/40" : undefined} />
              <StatTile label="Tickers per request" value={sent > 0 ? dec(tickersSent / sent) : "–"} hint="higher means better batching" />
            </div>
          </section>

          <section aria-labelledby="kpi-problems">
            <SectionLabel><span id="kpi-problems">Problems</span></SectionLabel>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <button type="button" onClick={() => showEvents("rate_limited")} className="rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="Show rate limited events"><StatTile label="Rate limited" value={num(sum((p) => p.totals.rateLimited))} hint={`last ${range}, by the provider`} className={sum((p) => p.totals.rateLimited) > 0 ? "border-loss/50" : undefined} /></button>
              <button type="button" onClick={() => showEvents("denied")} className="rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label="Show denied events"><StatTile label="Denied" value={num(sum((p) => p.totals.denied))} hint={`last ${range}, by our budget`} /></button>
              <button type="button" onClick={() => showEvents("errors")} className="col-span-2 rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:col-span-1" aria-label="Show failed events"><StatTile label="Failed" value={num(sum((p) => p.totals.failed))} hint={`last ${range}, errors`} className={sum((p) => p.totals.failed) > 0 ? "border-loss/50" : undefined} /></button>
            </div>
          </section>

          <section aria-labelledby="kpi-load">
            <SectionLabel><span id="kpi-load">Load</span></SectionLabel>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile label="Requests today" value={num(sum((p) => p.today.requests))} hint="UTC day" />
              <StatTile label="Tickers today" value={num(sum((p) => p.today.symbols))} hint="symbols across requests" />
              <StatTile
                label="Peak utilization"
                value={hottest ? pct(hottest.peakRatio) : "–"}
                hint={hottest ? `${hottest.provider} ${num(hottest.peak.value)}/${hottest.limit.per === "hour" ? "hr" : "min"} · ${formatWhen(hottest.peak.at!, range)}` : "no requests in range"}
                className={cn("col-span-2 lg:col-span-1", hottest?.warn && "border-loss/50")}
              />
            </div>
          </section>

          <BudgetHelp />

          {providers.map((p) => <ProviderCard key={p.provider} p={p} range={range} />)}

          <CollapsibleCard storageKey="providers-daily" title={<h2 className="font-medium">Daily totals</h2>}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {providers.map((p) => <li key={p.provider} className="flex items-center gap-1.5 capitalize"><span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: colorOf(p.provider) }} />{p.provider}</li>)}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Requests per day</p>
                <GroupedBarChart labels={dayLabels} series={seriesFor((d) => d.requests)} ariaLabel="Requests per day by provider" />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tickers per day</p>
                <GroupedBarChart labels={dayLabels} series={seriesFor((d) => d.symbols)} ariaLabel="Tickers per day by provider" />
              </div>
          </CollapsibleCard>
        </>
      ) : null}

      {data ? <TickersSection /> : null}

      {data ? <EventsSection range={range} filter={eventFilter} onFilter={setEventFilter} /> : null}
    </main>
  )
}
