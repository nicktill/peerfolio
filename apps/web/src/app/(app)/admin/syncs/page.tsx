"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Info, RefreshCw, Repeat, XCircle } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { StatTile } from "@web/components/ui/stat-tile"
import { useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import { SLOW_RUN_MS, TRIGGER_LABELS, explainRun, itemHealth, triggerLabel, type Severity } from "@web/lib/plaid-sync-explain"

type Run = {
  id: string; item: string; owner: string | null; institution: string | null; trigger: string; startedAt: string; durationMs: number
  status: "ok" | "partial" | "failed"; errorCode: string | null; requestId: string | null
  accounts: number; received: number; kept: number; skipped: Record<string, number>
  currencyAssumed: number; missingTicker: number; balanceWithoutHoldings: boolean; concern: string | null
}

type Item = { id: string; owner: string; institution: string | null; status: string; errorCode: string | null; lastSyncedAt: string | null; createdAt: string }
type RunSummary = { status: "ok" | "partial" | "failed"; errorCode: string | null; durationMs: number; accounts: number; received: number; kept: number; skipped: Record<string, number>; awaiting: boolean; concern: string | null }
type Outcome = { state: "refresh-confirm" } | { state: "refresh-done"; requestId: string | null } | { state: "confirm" | "running" } | { state: "done"; summary: RunSummary | null; status: string } | { state: "error"; message: string }
type Filter = "all" | "issues"

const FILTERS: readonly { value: Filter; label: string }[] = [{ value: "all", label: "All runs" }, { value: "issues", label: "Needs attention" }]

const skippedText = (skipped: Record<string, number>) => Object.entries(skipped).map(([reason, n]) => `${n} ${reason}`).join(", ") || "–"

const TONE: Record<Severity, { text: string; dot: string; badge: string; Icon: typeof Info }> = {
  ok: { text: "text-gain-ink", dot: "bg-[var(--gain)]", badge: "bg-gain/10 text-gain-ink", Icon: CheckCircle2 },
  info: { text: "text-muted-foreground", dot: "bg-muted-foreground/60", badge: "bg-secondary text-muted-foreground", Icon: Info },
  warn: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: AlertTriangle },
  error: { text: "text-loss-ink", dot: "bg-[var(--loss)]", badge: "bg-loss/10 text-loss-ink", Icon: XCircle },
}

function ago(iso: string | null, now = Date.now()) {
  if (!iso) return "never"
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86_400)} d ago`
}

const toExplainRun = (r: Run) => ({ trigger: r.trigger, startedAt: r.startedAt, durationMs: r.durationMs, status: r.status, errorCode: r.errorCode, accounts: r.accounts, received: r.received, kept: r.kept, skipped: r.skipped, currencyAssumed: r.currencyAssumed, missingTicker: r.missingTicker, balanceWithoutHoldings: r.balanceWithoutHoldings })

function Badge({ severity, children }: { severity: Severity; children: React.ReactNode }) {
  const { badge, Icon } = TONE[severity]
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", badge)}><Icon aria-hidden className="size-3" />{children}</span>
}

/** Newest on the right, so the strip reads like a timeline. */
function History({ recent }: { recent: Severity[] }) {
  if (!recent.length) return null
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`Last ${recent.length} runs, oldest to newest: ${[...recent].reverse().join(", ")}`}>
      {[...recent].reverse().map((s, i) => <span key={i} className={cn("h-4 w-1.5 rounded-sm", TONE[s].dot)} />)}
    </div>
  )
}

export default function SyncRunsPage() {
  const { data, error, loading, refetch } = useApi<{ runs: Run[]; items: Item[] }>("/api/admin/plaid-syncs", [], { refreshMs: 60_000 })
  const runs = data?.runs ?? []
  const items = data?.items ?? []
  const [filter, setFilter] = useState<Filter>("all")
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const setOutcome = (id: string, outcome: Outcome | null) => setOutcomes((prev) => {
    const next = { ...prev }
    if (outcome) next[id] = outcome; else delete next[id]
    return next
  })
  async function syncNow(id: string) {
    setOutcome(id, { state: "running" })
    try {
      const res = await fetch("/api/admin/plaid-syncs/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: id }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setOutcome(id, { state: "error", message: body.error ?? "Sync failed" }); return }
      setOutcome(id, { state: "done", summary: body.run, status: body.result.status })
      void refetch()
    } catch {
      setOutcome(id, { state: "error", message: "Could not reach the server" })
    }
  }
  async function requestRefresh(id: string) {
    setOutcome(id, { state: "running" })
    try {
      const res = await fetch("/api/admin/plaid-syncs/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: id }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setOutcome(id, { state: "error", message: `${body.code ? `${body.code}: ` : ""}${body.error ?? "Refresh request failed"}` }); return }
      setOutcome(id, { state: "refresh-done", requestId: body.requestId ?? null })
      void refetch()
    } catch {
      setOutcome(id, { state: "error", message: "Could not reach the server" })
    }
  }

  const now = Date.now()
  const dayAgo = now - 86_400_000
  const explained = runs.map((r) => ({ r, ex: explainRun(toExplainRun(r)) }))
  const last24 = explained.filter(({ r }) => new Date(r.startedAt).getTime() >= dayAgo)
  const failed24 = last24.filter(({ ex }) => ex.severity === "error").length
  const partial24 = last24.filter(({ ex }) => ex.severity === "warn").length

  // Newest runs are first in `runs`, which is the order itemHealth wants.
  const cards = items.map((it) => {
    const mine = explained.filter(({ r }) => r.item === it.id.slice(0, 8))
    return { it, health: itemHealth(mine.map(({ r }) => toExplainRun(r))), count: mine.length }
  })
  const owners = new Map<string, number>()
  items.forEach((it) => owners.set(it.owner, (owners.get(it.owner) ?? 0) + 1))
  const needsAttention = cards.filter(({ health }) => health.severity === "warn" || health.severity === "error")
  const healthy = cards.length - needsAttention.length
  const shown = filter === "issues" ? explained.filter(({ ex }) => ex.severity === "warn" || ex.severity === "error") : explained

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Repeat aria-hidden className="size-6" />Brokerage syncs</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Each connection&apos;s health and the last 100 sync attempts, kept 30 days. Counts and codes only: no balances, tickers, holdings, names or emails. People appear as an anonymous <span className="font-mono">user·tag</span> that stays the same across their connections.</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => void refetch()} aria-label="Refresh" title="Refresh"><RefreshCw aria-hidden className={cn("size-4", loading && "animate-spin")} /></Button>
      </div>

      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
      {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading syncs…</p> : null}
      {data && runs.length === 0 && items.length === 0 ? <Card><EmptyState icon={Repeat} title="No syncs recorded yet" description="Runs appear here after the next brokerage sync." /></Card> : null}

      {data && (items.length || runs.length) ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Connections healthy" value={`${healthy}/${cards.length}`} hint={needsAttention.length ? `${needsAttention.length} need attention` : "all syncing cleanly"} className={needsAttention.length ? "border-loss/50" : undefined} />
          <StatTile label="Syncs, last 24h" value={String(last24.length)} hint="all triggers" />
          <StatTile label="Failed, last 24h" value={String(failed24)} hint="nothing saved" className={failed24 ? "border-loss/50" : undefined} />
          <StatTile label="Partial, last 24h" value={String(partial24)} hint="saved with gaps" />
        </div>
      ) : null}

      {cards.length ? (
        <section aria-labelledby="connections-heading" className="space-y-3">
          <h2 id="connections-heading" className="font-medium">Connections</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {[...cards].sort((a, b) => ({ error: 0, warn: 1, info: 2, ok: 3 }[a.health.severity] - { error: 0, warn: 1, info: 2, ok: 3 }[b.health.severity])).map(({ it, health, count }) => {
              const o = outcomes[it.id]
              const tone = TONE[health.severity]
              const sameOwner = owners.get(it.owner) ?? 1
              return (
                <Card key={it.id} className={cn("space-y-3 p-4 text-sm", (health.severity === "error" || health.severity === "warn") && "border-loss/40")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{it.institution ?? "Connection"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">user·{it.owner}</span>{sameOwner > 1 ? ` (${sameOwner} connections)` : ""} · <span className="font-mono">{it.id.slice(0, 8)}</span> · linked {new Date(it.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge severity={health.severity}>{health.severity === "ok" ? "Healthy" : health.severity === "info" ? "Healthy, with notes" : health.severity === "warn" ? "Needs a look" : "Failing"}</Badge>
                  </div>

                  <div>
                    <p className={cn("font-medium", tone.text)}>{health.headline}</p>
                    <p className="mt-1 text-muted-foreground">{health.detail}</p>
                    {health.action ? <p className="mt-1.5"><span className="font-medium">Next: </span><span className="text-muted-foreground">{health.action}</span></p> : null}
                    {it.status !== "active" ? <p className="mt-1.5 text-xs text-loss-ink">Connection status is “{it.status}”{it.errorCode ? ` (${it.errorCode})` : ""}. The user&apos;s dashboard is likely showing a reconnect prompt.</p> : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Last saved {ago(it.lastSyncedAt)}{it.lastSyncedAt ? ` (${new Date(it.lastSyncedAt).toLocaleString()})` : ""}</span>
                    <span className="flex items-center gap-2">{count} run{count === 1 ? "" : "s"} on record <History recent={health.recent} /></span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t pt-3" aria-live="polite">
                    {o?.state === "error" ? <span role="alert" className="text-xs text-loss-ink">{o.message}</span> : null}
                    {o?.state === "done" ? (
                      <span className={cn("text-xs", o.summary?.status === "ok" ? "text-gain-ink" : "text-loss-ink")}>
                        {o.summary
                          ? `${o.summary.status}${o.summary.errorCode ? ` · ${o.summary.errorCode}` : ""}: received ${o.summary.received}, kept ${o.summary.kept}, skipped ${skippedText(o.summary.skipped)}, awaiting ${o.summary.awaiting ? "yes" : "no"}`
                          : `Finished (${o.status}); the run was not logged`}
                      </span>
                    ) : null}
                    {o?.state === "refresh-done" ? <span className="text-xs text-gain-ink">Refresh requested{o.requestId ? ` (${o.requestId})` : ""}. Plaid will notify us when ready; Sync now afterwards also works.</span> : null}
                    {o?.state === "refresh-confirm" ? (
                      <>
                        <span className="text-xs text-muted-foreground">Ask Plaid to re-extract from the institution? Limited to once per 10 min; may be rate-limited or billed outside the Trial.</span>
                        <Button size="sm" onClick={() => void requestRefresh(it.id)}>Confirm refresh</Button>
                        <Button size="sm" variant="outline" onClick={() => setOutcome(it.id, null)}>Cancel</Button>
                      </>
                    ) : o?.state === "confirm" ? (
                      <>
                        <span className="text-xs text-muted-foreground">Re-run this sync from the stored data at Plaid?</span>
                        <Button size="sm" onClick={() => void syncNow(it.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setOutcome(it.id, null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" disabled={o?.state === "running"} onClick={() => setOutcome(it.id, { state: "refresh-confirm" })}>Ask Plaid to refresh from the institution</Button>
                        <Button size="sm" variant="outline" disabled={o?.state === "running"} onClick={() => setOutcome(it.id, { state: "confirm" })}>
                          <RefreshCw aria-hidden className={cn("size-3.5", o?.state === "running" && "animate-spin")} />{o?.state === "running" ? "Working…" : "Sync now"}
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      ) : null}

      {runs.length ? (
        <section aria-labelledby="runs-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="runs-heading" className="font-medium">Run log</h2>
            <Segmented<Filter> label="Filter runs" options={FILTERS} value={filter} onChange={setFilter} />
          </div>
          {shown.length === 0 ? <Card><EmptyState icon={CheckCircle2} title="Nothing needs attention" description="Every recorded run saved cleanly." /></Card> : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>{["When", "Connection", "Started by", "What happened", "Data"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {shown.map(({ r, ex }) => (
                    <tr key={r.id} className={cn("border-b align-top last:border-0", (ex.severity === "error" || ex.severity === "warn") && "bg-loss/5")}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {ago(r.startedAt, now)}
                        <span className="block text-xs text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</span>
                        <span className={cn("block text-xs", r.durationMs >= SLOW_RUN_MS ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{(r.durationMs / 1000).toFixed(1)}s{r.durationMs >= SLOW_RUN_MS ? " · slow" : ""}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.institution ?? "–"}
                        <span className="block font-mono text-xs text-muted-foreground">{r.owner ? `user·${r.owner} · ` : ""}{r.item}</span>
                      </td>
                      <td className="px-3 py-2.5" title={TRIGGER_LABELS[r.trigger]?.hint}>{triggerLabel(r.trigger)}</td>
                      <td className="max-w-md px-3 py-2.5">
                        <Badge severity={ex.severity}>{ex.headline}</Badge>
                        {r.errorCode ? <span className="ml-2 font-mono text-xs text-muted-foreground">{r.errorCode}</span> : null}
                        {ex.severity !== "ok" ? <p className="mt-1 text-xs text-muted-foreground">{ex.detail}</p> : null}
                        {ex.action ? <p className="mt-1 text-xs"><span className="font-medium">Next: </span><span className="text-muted-foreground">{ex.action}</span></p> : null}
                        {r.requestId ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">Plaid request {r.requestId}</p> : null}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        <span className="block">{r.accounts} account{r.accounts === 1 ? "" : "s"}</span>
                        <span className="block">{r.kept} of {r.received} lines kept</span>
                        {Object.keys(r.skipped).length ? <span className="block">Left out: {skippedText(r.skipped)}</span> : null}
                        {r.currencyAssumed ? <span className="block">{r.currencyAssumed} currency assumed</span> : null}
                        {r.missingTicker ? <span className="block">{r.missingTicker} without ticker</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      ) : null}
    </main>
  )
}
