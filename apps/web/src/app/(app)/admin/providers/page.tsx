"use client"

import { useState } from "react"
import { Activity, AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { StatTile } from "@web/components/ui/stat-tile"
import { GroupedBarChart, UsageLineChart } from "@web/components/charts/usage-chart"
import { useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
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

function ProviderCard({ p, range }: { p: ProviderDashboard; range: RangeKey }) {
  const unit = p.limit.per === "hour" ? "hr" : "min"
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-medium capitalize">
            <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: colorOf(p.provider) }} />{p.provider}
          </h2>
          {p.warn ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-loss/10 px-2 py-0.5 text-xs font-medium text-loss-ink"><AlertTriangle aria-hidden className="size-3" />Near limit</span>
          ) : (
            <span className="text-xs text-muted-foreground">{p.totals.requests === 0 ? "No requests in range" : "Within limit"}</span>
          )}
        </div>
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
          Rate limited {num(p.totals.rateLimited)} · denied by our budget {num(p.totals.denied)} · failed {num(p.totals.failed)}
        </p>
      </CardContent>
    </Card>
  )
}

export default function ProviderUsagePage() {
  const [range, setRange] = useState<RangeKey>("24h")
  const { data, error, loading, refetch } = useApi<Dashboard>(`/api/admin/provider-stats?range=${range}`, [], { refreshMs: 60_000 })

  const providers = data?.providers ?? []
  const sum = (pick: (p: ProviderDashboard) => number) => providers.reduce((n, p) => n + pick(p), 0)
  const hottest = providers.reduce<ProviderDashboard | null>((best, p) => (p.peak.value > 0 && (!best || p.peakRatio > best.peakRatio) ? p : best), null)
  const warned = providers.filter((p) => p.warn)
  const dayCount = range === "30d" ? 30 : 7
  const days = (providers[0]?.days ?? []).slice(-dayCount)
  const dayLabels = days.map((d) => d.date)
  const seriesFor = (pick: (d: ProviderDashboard["days"][number]) => number) =>
    providers.map((p) => ({ key: p.provider, label: p.provider, color: colorOf(p.provider), values: p.days.slice(-dayCount).map(pick) }))

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Activity aria-hidden className="size-6" />Provider usage</h1>
          <p className="mt-2 text-sm text-muted-foreground">Requests and tickers sent to each price provider. Refreshes every minute.</p>
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

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile label="Requests today" value={num(sum((p) => p.today.requests))} hint="UTC day" />
            <StatTile label="Tickers today" value={num(sum((p) => p.today.symbols))} hint="symbols across requests" />
            <StatTile
              label="Peak utilization"
              value={hottest ? pct(hottest.peakRatio) : "–"}
              hint={hottest ? `${hottest.provider} ${num(hottest.peak.value)}/${hottest.limit.per === "hour" ? "hr" : "min"} · ${formatWhen(hottest.peak.at!, range)}` : "no requests in range"}
              className={hottest?.warn ? "border-loss/50" : undefined}
            />
            <StatTile label="Rate limited" value={num(sum((p) => p.totals.rateLimited))} hint={`last ${range}, by the provider`} className={sum((p) => p.totals.rateLimited) > 0 ? "border-loss/50" : undefined} />
            <StatTile label="Denied" value={num(sum((p) => p.totals.denied))} hint={`last ${range}, by our budget`} />
            <StatTile label="Failed" value={num(sum((p) => p.totals.failed))} hint={`last ${range}, errors`} />
          </div>

          {providers.map((p) => <ProviderCard key={p.provider} p={p} range={range} />)}

          <Card>
            <CardContent className="space-y-5 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Daily totals</h2>
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
            </CardContent>
          </Card>
        </>
      ) : null}
    </main>
  )
}
