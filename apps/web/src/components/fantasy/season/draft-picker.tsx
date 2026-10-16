"use client"

import { useMemo, useState } from "react"
import { Check, Lock, X } from "lucide-react"
import { TickerCombobox } from "@web/components/fantasy/ticker-combobox"
import { Countdown } from "@web/components/fantasy/season/season-parts"
import { formatDeadline } from "@web/components/fantasy/season/season-format"
import { useToast } from "@web/components/ui/toast"
import { plural } from "@web/lib/plural"
import { mutate } from "@web/lib/use-api"
import type { SeasonView } from "@web/lib/fantasy-season-view"

type Draft = NonNullable<SeasonView["draft"]>

/**
 * Pick this round's stocks. Picks stay private until the deadline, then everyone's
 * are shown. The deadline is enforced on the server; the countdown here is only a clock.
 */
export function DraftPicker({ leagueId, draft, onSaved }: { leagueId: string; draft: Draft; onSaved: () => void }) {
  const { toast } = useToast()
  const [tickers, setTickers] = useState<string[]>(() => Array.from({ length: draft.slots }, (_, i) => draft.yours[i]?.ticker ?? ""))
  const [notes, setNotes] = useState<string[]>(() => Array.from({ length: draft.slots }, (_, i) => draft.yours[i]?.note?.body ?? ""))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(draft.yours.length > 0)

  const chosen = useMemo(() => tickers.map((t) => t.trim().toUpperCase()).filter(Boolean), [tickers])
  const duplicate = new Set(chosen).size !== chosen.length
  const problem = chosen.length === 0 ? "Pick at least one stock" : duplicate ? "Each pick has to be a different stock" : null

  const set = (i: number, value: string) => {
    setSaved(false)
    setTickers((t) => t.map((x, k) => (k === i ? value : x)))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (problem) return toast(problem, "error")
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      tickers.forEach((t, i) => {
        const key = t.trim().toUpperCase()
        if (key && notes[i]?.trim()) body[key] = notes[i]!.trim()
      })
      await mutate(`/api/fantasy/${leagueId}/picks`, { method: "PUT", body: { tickers: chosen, notes: body } })
      setSaved(true)
      toast("Picks saved. Change them any time before the lock.", "success")
      onSaved()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save your picks.", "error")
    } finally {
      setSaving(false)
    }
  }

  if (!draft.open) {
    return (
      <div className="fs-draft">
        <span className="fs-locked-tag">
          <Lock aria-hidden /> Picks locked
        </span>
        <p className="fs-note-line" style={{ padding: 0 }}>
          The deadline has passed. Everyone&apos;s picks show once the round starts.
        </p>
      </div>
    )
  }

  return (
    <form className="fs-draft" onSubmit={save}>
      <div className="fw-note">
        Pick up to {plural(draft.slots, "stock")}. Equal weight, scored from the close at the lock to the close on Friday. Locks {formatDeadline(draft.deadline)}, in <Countdown to={draft.deadline} />.
      </div>
      {tickers.map((ticker, i) => (
        <div key={i} className="fs-slot">
          <span className="fs-slot-n">{i + 1}</span>
          <div className="fs-slot-fields">
            <TickerCombobox value={ticker} onChange={(v) => set(i, v)} className="fw-input" />
            {ticker.trim() ? (
              <input
                className="fw-input fs-why"
                value={notes[i] ?? ""}
                maxLength={280}
                onChange={(e) => {
                  setSaved(false)
                  setNotes((n) => n.map((x, k) => (k === i ? e.target.value : x)))
                }}
                placeholder="Why this one? (optional)"
                aria-label={`Why you picked ${ticker.trim().toUpperCase()}`}
              />
            ) : null}
          </div>
          {ticker.trim() ? (
            <button type="button" className="fs-slot-x" onClick={() => set(i, "")} aria-label={`Clear pick ${i + 1}`}>
              <X aria-hidden />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      <div className="fs-draft-foot">
        <span className="fw-note" aria-live="polite">
          {problem ?? (saved ? "Saved. Only you can see your picks until the lock." : `${chosen.length} of ${draft.slots} picked. Empty slots count as cash.`)}
        </span>
        <button type="submit" className="fw-btn" data-solid disabled={saving || !!problem} aria-busy={saving || undefined}>
          {saved && !saving ? <Check aria-hidden /> : null}
          {saving ? "Saving…" : saved ? "Saved" : draft.yours.length > 0 ? "Update picks" : "Lock in picks"}
        </button>
      </div>
      {draft.waitingOn.length > 0 ? (
        <div className="fs-waiting">
          <span>
            {draft.submitted} of {draft.players} in.
          </span>
          <span>
            Waiting on <b>{draft.waitingOn.map((p) => (p.isYou ? "you" : (p.name?.split(" ")[0] ?? p.handle ?? "a player"))).join(", ")}</b>
          </span>
        </div>
      ) : (
        <div className="fs-waiting">Everyone has picked.</div>
      )}
    </form>
  )
}
