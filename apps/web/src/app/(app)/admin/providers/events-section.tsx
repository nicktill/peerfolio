"use client"

import { useState } from "react"
import { ChevronRight, ListFilter } from "lucide-react"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import { EVENT_KINDS, type EventKind, type EventsResponse, type ProviderEventRow, type RangeKey } from "@web/lib/provider-stats-core"

export type KindFilter = "all" | "errors" | EventKind
export type EventFilter = { provider: string; kind: KindFilter }

const PROVIDERS = ["alpaca", "finnhub", "massive", "tiingo"] as const
export const KIND_LABEL: Record<EventKind, string> = { denied: "Denied", rate_limited: "Rate limited", failed: "Failed", timeout: "Timeout" }
const KIND_TIP: Record<EventKind, string> = {
  denied: "Our own limiter refused it; no request was sent",
  rate_limited: "The provider answered 429; all servers pause",
  failed: "The provider answered an error",
  timeout: "No answer in time",
}

const KIND_OPTIONS: readonly { value: KindFilter; label: string; title?: string }[] = [
  { value: "all", label: "All" },
  { value: "errors", label: "Failed + timeout", title: "What the Failed tile counts" },
  ...EVENT_KINDS.map((k) => ({ value: k as KindFilter, label: KIND_LABEL[k], title: KIND_TIP[k] })),
]
const PROVIDER_OPTIONS = [{ value: "all", label: "All providers" }, ...PROVIDERS.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))] as const

const kindsParam = (kind: KindFilter) => (kind === "all" ? "" : kind === "errors" ? "failed,timeout" : kind)

function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`
  return `${Math.floor(s / 86_400)}d ago`
}
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`

function KindBadge({ kind }: { kind: EventKind }) {
  return (
    <span title={KIND_TIP[kind]} className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", kind === "denied" ? "bg-secondary text-foreground" : "bg-loss/10 text-loss-ink")}>
      {KIND_LABEL[kind]}
    </span>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  )
}

function EventRow({ e, open, onToggle }: { e: ProviderEventRow; open: boolean; onToggle: () => void }) {
  const panel = `event-${e.id}`
  return (
    <li className="border-t first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panel} className="grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 px-1 py-2.5 text-left hover:bg-secondary/50 sm:grid-cols-[1.25rem_7.5rem_5rem_5.5rem_3rem_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)] sm:items-center">
        <ChevronRight aria-hidden className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="text-sm sm:contents">
          <span className="numeric sm:block" title={utc(e.at)}>{ago(e.at)}</span>
          <span className="ml-2 capitalize sm:ml-0 sm:block">{e.provider}</span>
        </span>
        <span className="col-start-2 sm:col-start-auto"><KindBadge kind={e.kind} /></span>
        <span className="numeric hidden text-sm text-muted-foreground sm:block">{e.httpStatus ?? "–"}</span>
        <span className="col-start-2 truncate font-mono text-xs sm:col-start-auto" title={e.endpoint}>{e.endpoint}</span>
        <span className="col-start-2 truncate text-sm sm:col-start-auto" title={e.reason}>{e.reason}</span>
        <span className="col-start-2 truncate font-mono text-xs text-muted-foreground sm:col-start-auto">{e.symbolsSample.join(", ") || "–"}{e.symbolsCount > e.symbolsSample.length ? ` +${e.symbolsCount - e.symbolsSample.length}` : ""}</span>
      </button>
      {open ? (
        <dl id={panel} className="grid gap-3 border-t bg-secondary/30 px-4 py-3 sm:grid-cols-2">
          <Detail label="When"><span className="numeric">{utc(e.at)}</span> ({ago(e.at)})</Detail>
          <Detail label="Provider · kind">{e.provider} · {KIND_LABEL[e.kind]} <span className="text-muted-foreground">({KIND_TIP[e.kind]})</span></Detail>
          <Detail label="HTTP status">{e.httpStatus ?? "none (no response)"}</Detail>
          <Detail label="Endpoint"><span className="font-mono text-xs">{e.endpoint}</span></Detail>
          <Detail label="Reason">{e.reason}</Detail>
          <Detail label="Tickers">{e.symbolsCount} in the request{e.symbolsSample.length ? <>, e.g. <span className="font-mono text-xs">{e.symbolsSample.join(", ")}</span></> : null}</Detail>
          <Detail label={e.kind === "denied" ? "Would have waited" : "Retry after"}>{e.waitSeconds != null ? `${e.waitSeconds}s` : "–"}</Detail>
          <Detail label="Asked by">{e.caller ?? "unlabeled"}</Detail>
          {e.suppressed > 0 ? <Detail label="Not logged">{e.suppressed} more like this were not stored (over the per-minute cap) before this one</Detail> : null}
        </dl>
      ) : null}
    </li>
  )
}

/** The non-success request log: filters, a summary by reason, and click-to-expand rows. */
export function EventsSection({ range, filter, onFilter }: { range: RangeKey; filter: EventFilter; onFilter: (next: EventFilter) => void }) {
  const [openId, setOpenId] = useState<number | null>(null)
  const query = new URLSearchParams({ range })
  if (filter.provider !== "all") query.set("provider", filter.provider)
  if (kindsParam(filter.kind)) query.set("kind", kindsParam(filter.kind))
  const { data, error, loading } = useApi<EventsResponse>(`/api/admin/provider-events?${query}`, [], { refreshMs: 60_000 })
  const events = data?.events ?? []
  const filtered = filter.provider !== "all" || filter.kind !== "all"

  return (
    <Card id="events" className="scroll-mt-20">
      <CardContent className="space-y-4 pt-5">
        <div>
          <h2 className="flex items-center gap-2 font-medium"><ListFilter aria-hidden className="size-4" />Events</h2>
          <p className="mt-1 text-xs text-muted-foreground">Requests that didn&apos;t succeed in the last {range}, newest first. Kept 14 days; each server logs at most 20 a minute per provider, so a long outage is sampled. Counters above are exact.</p>
        </div>

        {data ? (
          <ul className="flex flex-wrap gap-2 text-xs" aria-label="Events by kind">
            {EVENT_KINDS.map((k) => (
              <li key={k}><button type="button" onClick={() => onFilter({ provider: filter.provider, kind: k })} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 hover:bg-secondary"><KindBadge kind={k} /><span className="numeric font-medium">{data.totals[k].toLocaleString("en-US")}</span></button></li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Segmented<string> label="Provider" size="sm" options={PROVIDER_OPTIONS} value={filter.provider} onChange={(provider) => onFilter({ ...filter, provider })} />
          <Segmented<KindFilter> label="Kind" size="sm" options={KIND_OPTIONS} value={filter.kind} onChange={(kind) => onFilter({ ...filter, kind })} />
        </div>

        {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
        {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading events…</p> : null}

        {data && data.reasons.length > 0 ? (
          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">What went wrong{filtered ? " (filtered)" : ""}</h3>
            <ul className="divide-y rounded-lg border text-sm">
              {data.reasons.map((r) => (
                <li key={[r.provider, r.kind, r.httpStatus, r.reason].join("|")} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="numeric w-10 shrink-0 text-right font-medium">{r.count}×</span>
                  <span className="w-20 shrink-0 capitalize">{r.provider}</span>
                  <KindBadge kind={r.kind} />
                  {r.httpStatus ? <span className="numeric text-muted-foreground">{r.httpStatus}</span> : null}
                  <span className="min-w-0 flex-1 truncate" title={r.reason}>{r.reason}</span>
                  <span className="text-xs text-muted-foreground" title={utc(r.last)}>last {ago(r.last)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data && events.length === 0 ? (
          <EmptyState
            icon={ListFilter}
            title={filtered ? "No matching events" : "No events logged"}
            description={filtered ? "Nothing in this range matches the filters. Try All providers or All kinds, or a longer range." : "No request has been denied, rate limited or failed in this range, or the log only started recording after this deployed and its migration was applied."}
          />
        ) : null}

        {events.length > 0 ? (
          <div>
            <div aria-hidden className="hidden grid-cols-[1.25rem_7.5rem_5rem_5.5rem_3rem_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)] gap-x-3 px-1 pb-1.5 text-xs uppercase tracking-wide text-muted-foreground sm:grid">
              <span /><span>When</span><span>Provider</span><span>Kind</span><span>Status</span><span>Endpoint</span><span>Reason</span><span>Tickers</span>
            </div>
            <ul className="rounded-lg border">
              {events.map((e) => <EventRow key={e.id} e={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />)}
            </ul>
            {data?.more ? <p className="mt-2 text-xs text-muted-foreground">Showing the newest {events.length}. Narrow the filters or range to see older ones.</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
