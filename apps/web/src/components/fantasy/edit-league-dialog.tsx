"use client"

import { useState } from "react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { Choice, Row } from "@web/components/fantasy/choice"
import { LookPicker } from "@web/components/fantasy/league-look-picker"
import { mutate } from "@web/lib/use-api"

export type EditableLeague = { id: string; name: string; emoji: string; accent: string; endsAt: string | null }

/** Ways to extend a running league, counted from its current end date. */
const EXTENSIONS = [
  { label: "+1 week", days: 7 },
  { label: "+1 month", days: 30 },
  { label: "+3 months", days: 90 },
] as const

type Extension = "keep" | "forever" | number

/** Owner-only: rename the league, change its look, or give it more time. The server enforces who may. */
export function EditLeagueDialog({ league, open, onClose, onSaved }: { league: EditableLeague; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit league" description="Only you, as the owner, can change this." className="sm:max-w-xl">
      <EditForm league={league} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  )
}

function EditForm({ league, onClose, onSaved }: { league: EditableLeague; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(league.name)
  const [look, setLook] = useState({ emoji: league.emoji, accent: league.accent })
  const [extension, setExtension] = useState<Extension>("keep")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    // Only what changed goes up, so an unchanged field can never fail validation.
    const body: Record<string, unknown> = {}
    if (name.trim() !== league.name) body.name = name.trim()
    if (look.emoji !== league.emoji) body.emoji = look.emoji
    if (look.accent !== league.accent) body.accent = look.accent
    if (extension === "forever") body.endsAt = null
    else if (typeof extension === "number" && league.endsAt) body.endsAt = new Date(new Date(league.endsAt).getTime() + extension * 86_400_000).toISOString()

    if (Object.keys(body).length === 0) return onClose()
    setSaving(true)
    try {
      await mutate(`/api/fantasy/${league.id}`, { method: "PATCH", body })
      toast("League updated.", "success")
      onSaved()
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save that.", "error")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="edit-league-name" className="text-xs font-medium text-muted-foreground">
          League name
        </label>
        <input
          id="edit-league-name"
          data-autofocus
          required
          minLength={2}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        />
      </div>

      <LookPicker look={look} name={name} onChange={setLook} />

      {league.endsAt ? (
        <Row label="Give it more time">
          <Choice active={extension === "keep"} onClick={() => setExtension("keep")}>
            Keep end date
          </Choice>
          {EXTENSIONS.map((e) => (
            <Choice key={e.label} active={extension === e.days} onClick={() => setExtension(e.days)}>
              {e.label}
            </Choice>
          ))}
          <Choice active={extension === "forever"} onClick={() => setExtension("forever")}>
            No end date
          </Choice>
        </Row>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
