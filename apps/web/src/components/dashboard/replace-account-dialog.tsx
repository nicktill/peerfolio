"use client"

import { useId, useState } from "react"
import type { AccountRow } from "@web/components/dashboard/accounts-card"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { formatCurrency } from "@web/lib/format"
import { mutate } from "@web/lib/use-api"

export function ReplaceAccountButton({ accounts, hidden, disabled, onSaved }: { accounts: AccountRow[]; hidden: boolean; disabled?: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>Replace a manual account</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Replace a manual account" description="Choose the two entries that represent the same investment account.">
      {open ? <ReplacementForm accounts={accounts} hidden={hidden} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved() }} /> : null}
    </Dialog>
  </>
}

function ReplacementForm({ accounts, hidden, onCancel, onSaved }: { accounts: AccountRow[]; hidden: boolean; onCancel: () => void; onSaved: () => void }) {
  const id = useId()
  const { toast } = useToast()
  const [manualId, setManualId] = useState("")
  const [linkedId, setLinkedId] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const manual = accounts.find((a) => a.id === manualId)
  const linked = accounts.find((a) => a.id === linkedId)
  const label = (a: AccountRow) => `${a.name} · ${a.institutionName}${a.mask ? ` ···· ${a.mask}` : ""}`
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!manual || !linked || !confirmed || saving) return
    setSaving(true); setError("")
    try {
      await mutate("/api/accounts/replace", { method: "POST", body: { manualAccountId: manual.id, linkedAccountId: linked.id, confirmed: true } })
      toast("Manual entry replaced. Your linked account is now counted once.", "success")
      onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : "Could not replace that account."); setSaving(false) }
  }
  return <form onSubmit={submit} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label htmlFor={`${id}-manual`} className="space-y-2 text-sm">Manual entry
        <select id={`${id}-manual`} className="block h-11 w-full rounded-lg border bg-background px-3" value={manualId} disabled={saving} onChange={(e) => { setManualId(e.target.value); setConfirmed(false) }}>
          <option value="">Select manual account</option>
          {accounts.filter((a) => a.source === "manual" && a.category === "investment").map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-linked`} className="space-y-2 text-sm">Linked account to keep
        <select id={`${id}-linked`} className="block h-11 w-full rounded-lg border bg-background px-3" value={linkedId} disabled={saving} onChange={(e) => { setLinkedId(e.target.value); setConfirmed(false) }}>
          <option value="">Select linked account</option>
          {accounts.filter((a) => a.source === "plaid" && a.category === "investment").map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
        </select>
      </label>
    </div>
    {manual && linked ? <>
      <div className="grid gap-3 rounded-xl border bg-secondary/30 p-4 sm:grid-cols-2">
        {[{ a: manual, title: "Archive manual entry" }, { a: linked, title: "Keep linked account" }].map(({ a, title }) => <div key={a.id} className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p><p className="mt-1 font-medium">{a.name}</p>
          <p className="text-sm text-muted-foreground">{a.institutionName}{a.mask ? ` ···· ${a.mask}` : ""}</p>
          <p className="mt-2 numeric">{formatCurrency(a.balance, { hidden })}</p>
          <p className="text-xs text-muted-foreground">{a.positions.length} holdings</p>
        </div>)}
      </div>
      <p className="text-sm text-muted-foreground">The linked balance and holdings will be used. The manual entry is archived, with its holdings saved as a backup below Holdings. You can restore it after removing the linked connection. Existing portfolio history stays intact; removing the duplicate value is treated as a correction, not an investment loss.</p>
      {manual.balance !== linked.balance ? <p className="text-sm text-muted-foreground">These balances differ. Compare the account details with your brokerage before confirming.</p> : null}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4" checked={confirmed} disabled={saving} onChange={(e) => setConfirmed(e.target.checked)} /><span>I confirm these are the same investment account.</span></label>
    </> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!manual || !linked || !confirmed} loading={saving}>Replace manual entry</Button></div>
  </form>
}
