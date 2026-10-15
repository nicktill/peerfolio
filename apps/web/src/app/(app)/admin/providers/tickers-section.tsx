"use client"

import { useMemo, useState } from "react"
import { ChevronRight, Layers, Search } from "lucide-react"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import type { TickerRow, TickersResponse, TickerStatus } from "@web/lib/ticker-freshness-core"
import { ago } from "./events-section"

const STATUSES: readonly { status: TickerStatus; label: string; tip: string }[] = [
  { status: "behind", label: "Behind", tip: "Missing a price it should have by now" },
  { status: "pending", label: "Pending", tip: "About a session behind, which is normal until the next refresh" },
  { status: "live", label: "Live", tip: "Priced in the last few minutes while the market is open" },
  { status: "current", label: "Current", tip: "Has the latest official close or NAV" },
  { status: "brokerage", label: "Brokerage", tip: "Priced by the brokerage at each sync" },
]
const RANK: Record<TickerStatus, number> = { behind: 0, pending: 1, live: 2, current: 3, brokerage: 4 }
const BADGE: Record<TickerStatus, string> = {
  live: "bg-gain/15 text-gain-ink",
  current: "bg-secondary text-foreground",
  pending: "bg-primary/10 text-primary",
  behind: "bg-loss/10 text-loss-ink",
  brokerage: "bg-secondary text-muted-foreground",
}
const DOT: Record<TickerStatus, string> = { live: "bg-gain", current: "bg-muted-foreground/50", pending: "bg-primary", behind: "bg-loss", brokerage: "bg-muted-foreground/30" }

type SortKey = "status" | "symbol" | "holders" | "priced"
const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "status", label: "Needs attention" },
  { value: "priced", label: "Oldest price" },
  { value: "holders", label: "Most held" },
  { value: "symbol", label: "Symbol" },
]

const LIMIT = 200
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 })
const stamp = (t: TickerRow) => (t.pricedAt ? Date.parse(t.pricedAt) : t.asOf ? Date.parse(`${t.asOf}T00:00:00Z`) : 0)
const dayText = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

function pricedText(t: TickerRow) {
  if (t.pricedAt) return `priced ${ago(t.pricedAt)}`
  return t.asOf ? `close of ${dayText(t.asOf)}` : "never priced"
}

function nextText(iso: string | null, now: number) {
  if (!iso) return null
  const ms = Date.parse(iso) - now
  if (ms <= 0) return "next attempt due now"
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return `next attempt in ~${mins}m`
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  return ms < 20 * 3_600_000 ? `next attempt at ${time}` : `next attempt ${d.toLocaleDateString([], { weekday: "short" })} ${time}`
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  )
}

function TickerItem({ t, now, open, onToggle }: { t: TickerRow; now: number; open: boolean; onToggle: () => void }) {
  const panel = `ticker-${t.id}`
  const next = nextText(t.state.nextAttemptAt, now)
  const issues = t.issues
  const crypto = t.symbol.startsWith("X:")
  return (
    <li className="border-t first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panel} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-secondary/50">
        <ChevronRight aria-hidden className={cn("mt-2 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <TickerLogo symbol={crypto ? t.symbol.slice(2) : t.symbol} kind={crypto ? "crypto" : "stock"} size="sm" />
        <span className="grid min-w-0 flex-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-sm font-semibold">{t.symbol}</span>
              <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", BADGE[t.state.status])}>{t.state.label}</span>
              {issues ? <span className="numeric text-xs text-loss-ink" title="Denied, rate limited or failed requests in the last 24h">{issues.denied + issues.rateLimited + issues.failed} issues</span> : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{t.name ?? "Unnamed"}</span>
            <span className="numeric mt-0.5 block text-xs text-muted-foreground">
              {t.price != null ? <span className="font-medium text-foreground">{usd(t.price)}</span> : "no price"}
              {t.asOf ? ` · as of ${dayText(t.asOf)}${t.final ? "" : " (live)"}` : ""}
            </span>
          </span>
          <span className="min-w-0 text-xs text-muted-foreground">
            <span className="numeric block text-foreground">{pricedText(t)}{next ? ` · ${next}` : ""}</span>
            <span className="mt-0.5 line-clamp-2">{t.state.plan}</span>
          </span>
        </span>
      </button>
      {open ? (
        <dl id={panel} className="grid gap-3 border-t bg-secondary/30 px-4 py-3 sm:grid-cols-2">
          <Detail label="Holders">{t.holders.toLocaleString("en-US")} {t.holders === 1 ? "portfolio" : "portfolios"}{t.fantasyHolders > 0 ? `, ${t.fantasyHolders.toLocaleString("en-US")} in fantasy leagues` : ""}</Detail>
          <Detail label="Type">{t.type?.replace(/_/g, " ") ?? "unknown"}{t.marketTicker ? <> · <span className="font-mono text-xs">{t.marketTicker}</span></> : null}</Detail>
          <Detail label="Plan">{t.state.plan}</Detail>
          <Detail label="Issues, last 24h">{issues ? `${issues.rateLimited} rate limited · ${issues.denied} denied · ${issues.failed} failed` : "None"}</Detail>
          {issues?.last ? (
            <Detail label="Last issue">
              <span className="capitalize">{issues.last.provider}</span> · {issues.last.kind.replace(/_/g, " ")} · {ago(issues.last.at)}
              <span className="block text-muted-foreground">{issues.last.reason}</span>
            </Detail>
          ) : null}
        </dl>
      ) : null}
    </li>
  )
}

/** Every held ticker with how fresh its price is, what we're waiting for, and recent provider trouble. */
export function TickersSection() {
  const { data, error, loading } = useApi<TickersResponse>("/api/admin/provider-tickers", [], { refreshMs: 60_000 })
  const [status, setStatus] = useState<TickerStatus | "all">("all")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("status")
  const [openId, setOpenId] = useState<string | null>(null)

  const tickers = useMemo(() => data?.tickers ?? [], [data])
  const counts = useMemo(() => {
    const c: Record<TickerStatus, number> = { live: 0, current: 0, pending: 0, behind: 0, brokerage: 0 }
    for (const t of tickers) c[t.state.status]++
    return c
  }, [tickers])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = tickers.filter((t) => (status === "all" || t.state.status === status) && (!q || t.symbol.toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q)))
    const byAge = (a: TickerRow, b: TickerRow) => stamp(a) - stamp(b)
    return list.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol)
      if (sort === "holders") return b.holders - a.holders || a.symbol.localeCompare(b.symbol)
      if (sort === "priced") return byAge(a, b) || a.symbol.localeCompare(b.symbol)
      return RANK[a.state.status] - RANK[b.state.status] || byAge(a, b) || a.symbol.localeCompare(b.symbol)
    })
  }, [tickers, status, query, sort])

  const now = data ? Date.parse(data.now) : 0
  const chip = (active: boolean) => cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 hover:bg-secondary", active && "border-primary bg-primary/5")

  return (
    <Card id="tickers" className="scroll-mt-20">
      <CardContent className="space-y-4 pt-5">
        <div>
          <h2 className="flex items-center gap-2 font-display font-semibold"><Layers aria-hidden className="size-4" />Held tickers</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every ticker someone holds, and whether its price is where it should be right now.
            {data ? ` ${data.marketOpen ? `Market open, live quotes every ${Math.round(data.refreshSeconds / 60)} min.` : "Market closed."}` : ""}
          </p>
        </div>

        {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
        {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading tickers…</p> : null}

        {data ? (
          <>
            <ul className="flex flex-wrap gap-2 text-xs" aria-label="Tickers by state">
              <li>
                <button type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")} className={chip(status === "all")}>
                  All <span className="numeric font-medium">{tickers.length.toLocaleString("en-US")}</span>
                </button>
              </li>
              {STATUSES.map((s) => (
                <li key={s.status}>
                  <button type="button" title={s.tip} aria-pressed={status === s.status} onClick={() => setStatus(status === s.status ? "all" : s.status)} className={chip(status === s.status)}>
                    <span aria-hidden className={cn("size-2 rounded-full", DOT[s.status])} />
                    {s.label} <span className="numeric font-medium">{counts[s.status].toLocaleString("en-US")}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <span className="sr-only">Search tickers</span>
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol or name" className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground">
                  {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {tickers.length === 0 ? (
              <EmptyState icon={Layers} title="No held tickers" description="Nobody holds anything yet, so there is nothing to price." />
            ) : rows.length === 0 ? (
              <EmptyState icon={Search} title="No matching tickers" description="Nothing matches that search and state. Clear the filters to see everything." />
            ) : (
              <>
                <ul className="rounded-lg border">
                  {rows.slice(0, LIMIT).map((t) => <TickerItem key={t.id} t={t} now={now} open={openId === t.id} onToggle={() => setOpenId(openId === t.id ? null : t.id)} />)}
                </ul>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {rows.length > LIMIT ? `Showing the first ${LIMIT} of ${rows.length.toLocaleString("en-US")}. Search or filter to narrow.` : `${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "ticker" : "tickers"}.`}
                </p>
              </>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
