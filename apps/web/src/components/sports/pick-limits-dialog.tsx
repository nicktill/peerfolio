"use client"

import { useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import "@web/components/fantasy/fantasy-workspace.css"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { Choice, Row } from "@web/components/fantasy/choice"
import { formatCredits } from "@web/lib/sports/format"
import { mutate } from "@web/lib/use-api"

const PRESETS = [5, 10, 25, 50] as const
const MIN = 1
const MAX = 60

/** Owner-only: the largest single pick, as a percent of starting cash. Applies to picks placed from now on. */
export function PickLimitsButton({ leagueId, startingCredits, maxStakePct, onSaved }: { leagueId: string; startingCredits: number; maxStakePct: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="fw-btn" onClick={() => setOpen(true)} aria-label="Edit pick limits">
        <SlidersHorizontal aria-hidden /> <span>Pick limits</span>
      </button>
      {open ? <Dialog open onClose={() => setOpen(false)} title="Pick limits" description="Only you, as the owner, can change this." className="fw-dialog-panel sm:max-w-md">
        <LimitsForm leagueId={leagueId} startingCredits={startingCredits} maxStakePct={maxStakePct} onClose={() => setOpen(false)} onSaved={onSaved} />
      </Dialog> : null}
    </>
  )
}

function LimitsForm({ leagueId, startingCredits, maxStakePct, onClose, onSaved }: { leagueId: string; startingCredits: number; maxStakePct: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [pct, setPct] = useState(String(maxStakePct))
  const [saving, setSaving] = useState(false)
  const value = Math.floor(Number(pct.replace(/[^\d]/g, "")) || 0)
  const valid = value >= MIN && value <= MAX
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    if (value === maxStakePct) return onClose()
    setSaving(true)
    try {
      await mutate(`/api/sports/leagues/${leagueId}`, { method: "PATCH", body: { maxStakePct: value } })
      toast("Pick limit updated.", "success")
      onSaved()
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save that.", "error")
      setSaving(false)
    }
  }
  return (
    <form onSubmit={submit} className="fw-form fw-form-bare">
      <div>
        <label htmlFor="pick-limit-pct">Largest single pick (% of starting cash)</label>
        <input id="pick-limit-pct" data-autofocus className="fw-input numeric" inputMode="numeric" autoComplete="off" value={pct} onChange={(e) => setPct(e.target.value)} aria-invalid={!valid || undefined} />
        <p className="fw-hint">{valid ? `${formatCredits(Math.floor((startingCredits * value) / 100))} per pick, out of ${formatCredits(startingCredits)} starting cash. Applies to new picks only. Total cash at risk stays capped at 60% of starting cash.` : <span className="fw-bad">Choose a whole number from {MIN} to {MAX}.</span>}</p>
      </div>
      <Row label="Quick picks">
        {PRESETS.map((p) => (
          <Choice key={p} active={value === p} onClick={() => setPct(String(p))}>{p}%</Choice>
        ))}
      </Row>
      <div className="fw-form-actions">
        <button type="button" className="fw-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="fw-btn" data-solid disabled={saving || !valid} aria-busy={saving || undefined}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  )
}
