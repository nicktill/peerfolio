"use client"

import { useState } from "react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { cacheClear } from "@web/lib/api-cache"
import { mutate, useApi } from "@web/lib/use-api"

type Member = { id: string; league: string; credits: number; startingCredits: number; picks: number; parlays: number; open: number }
const money = (n: number) => `$${n.toLocaleString("en-US")}`

/** Only mounted on the administrator page; both API methods independently enforce admin access. */
export function AdminMemberReset({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false)
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}>League balances<span className="sr-only"> for {name}</span></Button>
    {open ? <ResetDialog userId={userId} name={name} onClose={() => setOpen(false)} /> : null}</>
}

function ResetDialog({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const { data, error, loading, refetch } = useApi<{ members: Member[] }>(`/api/admin/sports/members?userId=${encodeURIComponent(userId)}`)
  const [review, setReview] = useState<{ member: Member; requestId: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  async function reset() {
    if (!review || saving) return
    setSaving(true)
    try {
      await mutate("/api/admin/sports/members", { body: { memberId: review.member.id, expectedCredits: review.member.credits, requestId: review.requestId } })
      cacheClear("/api/sports/")
      toast(`${name} reset to ${money(review.member.startingCredits)} in ${review.member.league}. History archived.`, "success")
      setReview(null)
      await refetch()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Could not reset this member.", "error")
      await refetch()
    } finally { setSaving(false) }
  }
  return <Dialog open onClose={() => { if (!saving) onClose() }} title={`Sports balances · ${name}`} description="Reset one sports league membership to its starting cash. Other leagues and members keep their balances and history.">
    <div className="space-y-4">
      {error ? <p role="alert">{error}</p> : null}
      {loading && !data ? <p role="status">Loading sports leagues…</p> : null}
      {data?.members.length === 0 ? <p>This user has no sports league memberships.</p> : null}
      {review ? <div className="space-y-3 rounded-lg border p-4">
        <p className="font-medium">Reset {name} in {review.member.league}?</p>
        <p className="text-sm text-muted-foreground">Cash changes from {money(review.member.credits)} to {money(review.member.startingCredits)}. Their {review.member.picks} single picks and {review.member.parlays} parlays will be removed from the league history and standings. A private recovery snapshot is saved first.</p>
        <div className="flex gap-2"><Button disabled={saving} loading={saving} onClick={() => void reset()}>Reset to {money(review.member.startingCredits)}</Button><Button variant="outline" disabled={saving} onClick={() => setReview(null)}>Cancel</Button></div>
      </div> : <ul className="divide-y rounded-lg border">{data?.members.map(member => <li key={member.id} className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1"><p className="font-medium">{member.league}</p><p className="text-sm text-muted-foreground">{money(member.credits)} cash · {member.picks} singles · {member.parlays} parlays</p>{member.open ? <p className="text-xs text-muted-foreground">{member.open} open positions must settle or be cashed out first.</p> : null}</div>
        <Button size="sm" variant="outline" disabled={member.open > 0} onClick={() => setReview({ member, requestId: crypto.randomUUID() })}>Reset balance<span className="sr-only"> in {member.league}</span></Button>
      </li>)}</ul>}
    </div>
  </Dialog>
}
