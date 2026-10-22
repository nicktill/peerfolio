"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import "@web/components/fantasy/fantasy-workspace.css"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { Choice, Row } from "@web/components/fantasy/choice"
import { LookPicker } from "@web/components/fantasy/league-look-picker"
import { SPORT_CHOICES } from "@web/components/fantasy/create-league-flow"
import { ncaabEnabled } from "@web/lib/sports/flag"
import { formatCredits } from "@web/lib/sports/format"
import { mutate } from "@web/lib/use-api"

export type EditableSportsLeague = {
  id: string
  name: string
  emoji: string
  accent: string
  sports: string[]
  endsAt: string | null
  startingCredits: number
  maxStakePct: number
  /** Null follows the single-pick limit. */
  maxParlayStakePct: number | null
  liveBetting: boolean
}

const PRESETS = [5, 10, 25, 50] as const
const MIN = 1
const MAX = 60
const EXTENSIONS = [
  { label: "+1 week", days: 7 },
  { label: "+1 month", days: 30 },
  { label: "+3 months", days: 90 },
] as const

type Extension = "keep" | "forever" | number

const whole = (text: string) => Math.floor(Number(text.replace(/[^\d]/g, "")) || 0)
const inRange = (n: number) => n >= MIN && n <= MAX

/** Owner-only: everything about a sports league that can change after it starts. */
export function EditSportsLeagueButton({ league, onSaved }: { league: EditableSportsLeague; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="fw-btn sp-limits-btn" onClick={() => setOpen(true)} aria-label="Edit league">
        <Pencil aria-hidden /> <span>Edit league</span>
      </button>
      {open ? (
        <Dialog open onClose={() => setOpen(false)} title="Edit league" description="Only you, as the owner, can change this. Changes apply from now on; picks already placed are untouched." className="fw-dialog-panel sm:max-w-xl">
          <EditForm league={league} onClose={() => setOpen(false)} onSaved={onSaved} />
        </Dialog>
      ) : null}
    </>
  )
}

function EditForm({ league, onClose, onSaved }: { league: EditableSportsLeague; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(league.name)
  const [look, setLook] = useState({ emoji: league.emoji, accent: league.accent })
  const [extension, setExtension] = useState<Extension>("keep")
  const [single, setSingle] = useState(String(league.maxStakePct))
  const [parlay, setParlay] = useState(league.maxParlayStakePct == null ? "" : String(league.maxParlayStakePct))
  const [live, setLive] = useState(league.liveBetting)
  const [sports, setSports] = useState<string[]>(league.sports)

  const singleValue = whole(single)
  const parlayValue = parlay.trim() === "" ? null : whole(parlay)
  const valid = inRange(singleValue) && (parlayValue === null || inRange(parlayValue)) && sports.length > 0 && name.trim().length >= 2
  const choices = SPORT_CHOICES.filter((sp) => (sp.key !== "ncaab" || ncaabEnabled() || league.sports.includes("ncaab")))
  const effectiveParlay = parlayValue ?? singleValue

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    // Only what changed goes up, so an unchanged field can never fail validation.
    const body: Record<string, unknown> = {}
    if (name.trim() !== league.name) body.name = name.trim()
    if (look.emoji !== league.emoji) body.emoji = look.emoji
    if (look.accent !== league.accent) body.accent = look.accent
    if (extension === "forever") body.endsAt = null
    else if (typeof extension === "number" && league.endsAt) body.endsAt = new Date(new Date(league.endsAt).getTime() + extension * 86_400_000).toISOString()
    if (singleValue !== league.maxStakePct) body.maxStakePct = singleValue
    if (parlayValue !== league.maxParlayStakePct) body.maxParlayStakePct = parlayValue
    if (live !== league.liveBetting) body.liveBetting = live
    if (sports.slice().sort().join() !== league.sports.slice().sort().join()) body.sports = sports

    if (Object.keys(body).length === 0) return onClose()
    setSaving(true)
    try {
      await mutate(`/api/sports/leagues/${league.id}`, { method: "PATCH", body })
      toast("League updated.", "success")
      onSaved()
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save that.", "error")
      setSaving(false)
    }
  }

  const dropped = league.sports.filter((s) => !sports.includes(s))
  return (
    <form onSubmit={submit} className="fw-form fw-form-bare">
      <div>
        <label htmlFor="edit-sl-name">League name</label>
        <input id="edit-sl-name" data-autofocus required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="fw-input" />
      </div>
      <LookPicker look={look} name={name} onChange={setLook} />

      <Row label="Length">
        {league.endsAt ? (
          <>
            <Choice active={extension === "keep"} onClick={() => setExtension("keep")}>Keep end date</Choice>
            {EXTENSIONS.map((e) => <Choice key={e.label} active={extension === e.days} onClick={() => setExtension(e.days)}>{e.label}</Choice>)}
            <Choice active={extension === "forever"} onClick={() => setExtension("forever")}>No end date</Choice>
          </>
        ) : (
          <Choice active onClick={() => {}}>No end date</Choice>
        )}
      </Row>
      <p className="fw-hint">{league.endsAt ? `Ends ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(league.endsAt))}. A league can be extended, not shortened.` : "This league runs until you stop playing. An end date can't be added later."}</p>

      <div>
        <label htmlFor="edit-sl-single">Largest single pick (% of starting cash)</label>
        <input id="edit-sl-single" className="fw-input numeric" inputMode="numeric" autoComplete="off" value={single} onChange={(e) => setSingle(e.target.value)} aria-invalid={!inRange(singleValue) || undefined} />
        <p className="fw-hint">{inRange(singleValue) ? `${formatCredits(Math.floor((league.startingCredits * singleValue) / 100))} per pick, out of ${formatCredits(league.startingCredits)} starting cash.` : <span className="fw-bad">Choose a whole number from {MIN} to {MAX}.</span>}</p>
      </div>
      <Row label="Quick picks">
        {PRESETS.map((p) => <Choice key={p} active={singleValue === p} onClick={() => setSingle(String(p))}>{p}%</Choice>)}
      </Row>

      <div>
        <label htmlFor="edit-sl-parlay">Largest parlay (% of starting cash)</label>
        <input id="edit-sl-parlay" className="fw-input numeric" inputMode="numeric" autoComplete="off" placeholder={`Same as single (${singleValue || league.maxStakePct}%)`} value={parlay} onChange={(e) => setParlay(e.target.value)} aria-invalid={(parlayValue !== null && !inRange(parlayValue)) || undefined} />
        <p className="fw-hint">{parlayValue !== null && !inRange(parlayValue) ? <span className="fw-bad">Choose a whole number from {MIN} to {MAX}, or leave it empty.</span> : `${formatCredits(Math.floor((league.startingCredits * effectiveParlay) / 100))} per parlay.${parlayValue === null ? " Empty follows the single-pick limit." : ""}`}</p>
      </div>
      <Row label="Quick picks">
        <Choice active={parlayValue === null} onClick={() => setParlay("")}>Same as single</Choice>
        {PRESETS.map((p) => <Choice key={p} active={parlayValue === p} onClick={() => setParlay(String(p))}>{p}%</Choice>)}
      </Row>

      <Row label="Allow live picks">
        <Choice active={live} onClick={() => setLive(true)}>On</Choice>
        <Choice active={!live} onClick={() => setLive(false)}>Off</Choice>
      </Row>

      <Row label="Sports">
        {choices.map((sp) => (
          <Choice key={sp.key} active={sports.includes(sp.key)} onClick={() => setSports((cur) => (cur.includes(sp.key) ? cur.filter((x) => x !== sp.key) : [...cur, sp.key]))}>{sp.label}</Choice>
        ))}
      </Row>
      <p className="fw-hint">{sports.length === 0 ? <span className="fw-bad">Keep at least one sport.</span> : dropped.length ? "Removed sports stop offering new lines. Picks already placed on them still settle." : "Adding a sport offers its lines from now on."}</p>

      <div className="fw-form-actions">
        <button type="button" className="fw-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="fw-btn" data-solid disabled={saving || !valid} aria-busy={saving || undefined}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  )
}
