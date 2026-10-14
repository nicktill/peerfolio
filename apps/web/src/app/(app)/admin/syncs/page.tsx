"use client"

import { AlertTriangle, RefreshCw, Repeat } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

type Run = {
  id: string; item: string; institution: string | null; trigger: string; startedAt: string; durationMs: number
  status: "ok" | "partial" | "failed"; errorCode: string | null; requestId: string | null
  accounts: number; received: number; kept: number; skipped: Record<string, number>
  currencyAssumed: number; missingTicker: number; balanceWithoutHoldings: boolean; concern: string | null
}

const skippedText = (skipped: Record<string, number>) => Object.entries(skipped).map(([reason, n]) => `${n} ${reason}`).join(", ") || "–"

export default function SyncRunsPage() {
  const { data, error, loading, refetch } = useApi<{ runs: Run[] }>("/api/admin/plaid-syncs", [], { refreshMs: 60_000 })
  const runs = data?.runs ?? []
  const flagged = runs.filter((r) => r.status !== "ok" || r.balanceWithoutHoldings).length

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Repeat aria-hidden className="size-6" />Brokerage syncs</h1>
          <p className="mt-2 text-sm text-muted-foreground">The last 100 sync attempts, kept 30 days. Counts only: no balances, tickers or holdings.</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => void refetch()} aria-label="Refresh" title="Refresh"><RefreshCw aria-hidden className={cn("size-4", loading && "animate-spin")} /></Button>
      </div>

      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
      {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading syncs…</p> : null}
      {flagged > 0 ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-loss/40 bg-loss/10 p-4 text-sm text-loss-ink">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{flagged} of these runs failed or saved a balance without its holdings.</span>
        </div>
      ) : null}
      {data && runs.length === 0 ? <Card><EmptyState icon={Repeat} title="No syncs recorded yet" description="Runs appear here after the next brokerage sync." /></Card> : null}

      {runs.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>{["When", "Item", "Trigger", "Result", "Accounts", "Lines", "Kept", "Left out", "No ticker", "Request"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={cn("border-b last:border-0", r.status !== "ok" || r.balanceWithoutHoldings ? "bg-loss/5" : "")}>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.startedAt).toLocaleString()}<span className="block text-xs text-muted-foreground">{(r.durationMs / 1000).toFixed(1)}s</span></td>
                  <td className="px-3 py-2">{r.institution ?? "–"}<span className="block font-mono text-xs text-muted-foreground">{r.item}</span></td>
                  <td className="px-3 py-2">{r.trigger}</td>
                  <td className="px-3 py-2">
                    <span className={cn("font-medium", r.status === "ok" ? "text-gain-ink" : "text-loss-ink")}>{r.status}{r.errorCode ? ` · ${r.errorCode}` : ""}</span>
                    {r.concern ? <span className="block text-xs text-muted-foreground">{r.concern}</span> : null}
                  </td>
                  <td className="numeric px-3 py-2">{r.accounts}</td>
                  <td className="numeric px-3 py-2">{r.received}</td>
                  <td className="numeric px-3 py-2">{r.kept}</td>
                  <td className="px-3 py-2 text-xs">{skippedText(r.skipped)}{r.currencyAssumed ? <span className="block text-muted-foreground">{r.currencyAssumed} currency assumed</span> : null}</td>
                  <td className="numeric px-3 py-2">{r.missingTicker}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.requestId ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </main>
  )
}
