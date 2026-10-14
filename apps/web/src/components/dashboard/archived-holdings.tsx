"use client"

import { useState } from "react"
import type { ArchivedAccount } from "@web/components/dashboard/portfolio-screen"
import { Button } from "@web/components/ui/button"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import { formatCurrency } from "@web/lib/format"
import { mutate } from "@web/lib/use-api"

export function ArchivedHoldings({ accounts, hidden, disabled, onSaved }: { accounts: ArchivedAccount[]; hidden: boolean; disabled?: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  if (!accounts.length) return null
  async function restore(id: string) {
    if (busy) return
    setBusy(id); setError("")
    try { await mutate("/api/accounts/restore", { method: "POST", body: { manualAccountId: id } }); onSaved() }
    catch (err) { setError(err instanceof Error ? err.message : "Could not restore backup") }
    finally { setBusy(null) }
  }
  return <details className="pf-panel mt-4">
    <summary className="cursor-pointer px-4 py-4 font-mono text-xs uppercase tracking-wide text-muted-foreground sm:px-5">Archived holdings · {accounts.length} {accounts.length === 1 ? "account" : "accounts"}</summary>
    <div className="space-y-4 border-t p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">Saved manual holdings, excluded from totals and league returns. Values are frozen at replacement. Remove the linked brokerage connection before restoring a backup to avoid counting it twice.</p>
      {accounts.map((a) => <section key={a.id} className="rounded-xl border bg-secondary/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-muted-foreground"><h3 className="font-medium">{a.name}</h3><p className="text-xs">{a.institutionName} · Archived · {formatCurrency(a.balance, { hidden })}</p></div><Button size="sm" variant="outline" disabled={disabled || busy !== null} loading={busy === a.id} onClick={() => void restore(a.id)}>Restore backup</Button></div>
        <ul className="mt-3 divide-y text-sm text-muted-foreground">{a.positions.map((h) => <li key={h.id} className="flex items-center gap-3 py-2"><span className="grayscale"><TickerLogo symbol={h.ticker ?? ""} size="sm" /></span><span className="min-w-0 flex-1 truncate">{h.ticker ?? h.name ?? "Holding"}<span className="ml-2 text-xs">{hidden ? "••••" : `${h.quantity} shares`}</span></span><span className="numeric">{formatCurrency(h.value, { hidden })}</span></li>)}</ul>
      </section>)}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  </details>
}
