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
export function PickLimitsButton({ leagueId, startingCredits, maxStakePct, liveBetting, onSaved }: { leagueId: string; startingCredits: number; maxStakePct: number; liveBetting: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="fw-btn" onClick={() => setOpen(true)} aria-label="Edit pick limits">
        <SlidersHorizontal aria-hidden /> <span>Pick limits</span>
      </button>
      {open ? <Dialog open onClose={() => setOpen(false)} title="Pick limits" description="Only you, as the owner, can change this." className="fw-dialog-panel sm:max-w-md">
        <LimitsForm leagueId={leagueId} startingCredits={startingCredits} maxStakePct={maxStakePct} liveBetting={liveBetting} onClose={() => setOpen(false)} onSaved={onSaved} />
      </Dialog> : null}
    </>
  )
}

function LimitsForm({ leagueId, startingCredits, maxStakePct, liveBetting, onClose, onSaved }: { leagueId: string; startingCredits: number; maxStakePct: number; liveBetting: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [pct, setPct] = useState(String(maxStakePct))
  const [live, setLive] = useState(liveBetting)
  const [saving, setSaving] = useState(false)
  const value = Math.floor(Number(pct.replace(/[^\d]/g, "")) || 0)
  const valid = value >= MIN && value <= MAX
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    if (value === maxStakePct && live === liveBetting) return onClose()
    setSaving(true)
    try {
      await mutate(`/api/sports/leagues/${leagueId}`, { method: "PATCH", body: { maxStakePct: value, liveBetting: live } })
      toast("Pick settings updated.", "success")
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
      <Row label="Allow live picks">
        <Choice active={live} onClick={() => setLive(true)}>On</Choice>
        <Choice active={!live} onClick={() => setLive(false)}>Off</Choice>
      </Row>
      <p className="fw-hint">{live ? `Members can pick a game while it is in progress. Live picks risk up to ${Math.min(5, value)}% of starting cash, 2 per game, and settle on the final result.` : "Picks lock at kickoff. Live picks are off."}</p>
      <div className="fw-form-actions">
        <button type="button" className="fw-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="fw-btn" data-solid disabled={saving || !valid} aria-busy={saving || undefined}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  )
}
