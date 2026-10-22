"use client"

import { useState } from "react"
import { Avatar } from "@web/components/ui/avatar"
import "@web/components/fantasy/fantasy-workspace.css"

import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { Choice, Row } from "@web/components/fantasy/choice"
import { LookPicker } from "@web/components/fantasy/league-look-picker"
import { mutate } from "@web/lib/use-api"

/** Someone in the league, as the owner sees them when managing players. */
export type ManageableMember = { userId: string; name: string | null; handle: string | null; image: string | null; isYou: boolean; inactive?: boolean; benched?: boolean; observer?: boolean }

export type EditableLeague = { id: string; name: string; emoji: string; accent: string; endsAt: string | null }

/** Ways to extend a running league, counted from its current end date. */
const EXTENSIONS = [
  { label: "+1 week", days: 7 },
  { label: "+1 month", days: 30 },
  { label: "+3 months", days: 90 },
] as const

type Extension = "keep" | "forever" | number

/** Owner-only: rename the league, change its look, or give it more time. The server enforces who may. */
export function EditLeagueDialog({ league, members = [], open, onClose, onSaved }: { league: EditableLeague; members?: ManageableMember[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit league" description="Only you, as the owner, can change this." className="fw-dialog-panel sm:max-w-xl">
      <EditForm league={league} members={members} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  )
}

function EditForm({ league, members, onClose, onSaved }: { league: EditableLeague; members: ManageableMember[]; onClose: () => void; onSaved: () => void }) {
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
    <form onSubmit={submit} className="fw-form fw-form-bare">
      <div>
        <label htmlFor="edit-league-name">League name</label>
        <input
          id="edit-league-name"
          data-autofocus
          required
          minLength={2}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="fw-input"
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

      <Players leagueId={league.id} members={members} onChanged={onSaved} />

      <div className="fw-form-actions">
        <button type="button" className="fw-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="fw-btn" data-solid disabled={saving} aria-busy={saving || undefined}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  )
}

/**
 * Owner-only player management. Benching keeps someone in the league but out of
 * the standings; removing deletes their picks and trades. Both act at once, not
 * on "Save", and removing asks twice.
 */
function Players({ leagueId, members, onChanged }: { leagueId: string; members: ManageableMember[]; onChanged: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const others = members.filter((m) => !m.isYou)
  if (others.length === 0) return null

  async function act(userId: string, run: () => Promise<unknown>, done: string) {
    setBusy(userId)
    try {
      await run()
      toast(done, "success")
      setConfirming(null)
      onChanged()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't do that.", "error")
    } finally {
      setBusy(null)
    }
  }

  return (
    <fieldset>
      <legend>Players &amp; observers</legend>
      <p className="fw-sub">Observers keep access and can trade, but stay out of standings, season scoring, the trade feed and player counts. Buying does not restore their place.</p>
      <ul className="fw-members">
        {others.map((m) => {
          const name = m.name ?? m.handle ?? "Member"
          const url = `/api/fantasy/${leagueId}/members/${m.userId}`
          return (
            <li key={m.userId}>
              <Avatar src={m.image} name={m.name} handle={m.handle} size="sm" />
              <div>
                <strong>{name}</strong>
                <small>{m.observer ? "Observer · excluded from competition" : m.inactive ? (m.benched ? "Inactive · set by you, until they buy" : "Inactive · hasn't bought anything") : "Playing"}</small>
              </div>
              <div className="fw-member-actions">
                {confirming === m.userId ? (
                  <>
                    <button type="button" className="fw-btn" onClick={() => setConfirming(null)} disabled={busy === m.userId}>
                      Keep
                    </button>
                    <button
                      type="button"
                      className="fw-btn fw-danger"
                      disabled={busy === m.userId}
                      onClick={() => act(m.userId, () => mutate(url, { method: "DELETE" }), `${name} removed.`)}
                    >
                      Remove {name.split(" ")[0]}?
                    </button>
                  </>
                ) : (
                  <>
                    {m.observer || (m.inactive && !m.benched) ? null : (
                      <button
                        type="button"
                        className="fw-btn"
                        disabled={busy === m.userId}
                        onClick={() =>
                          act(m.userId, () => mutate(url, { method: "PATCH", body: { inactive: !m.benched } }), m.benched ? `${name} is back in.` : `${name} is now inactive.`)
                        }
                      >
                        {m.benched ? "Reactivate" : "Make inactive"}
                      </button>
                    )}
                    <button type="button" className="fw-btn" disabled={busy === m.userId}
                      onClick={() => act(m.userId, () => mutate(url, { method: "PATCH", body: { observer: !m.observer } }), m.observer ? `${name} can compete again.` : `${name} is now an observer.`)}>
                      {m.observer ? "Include in competition" : "Make observer"}
                    </button>
                    <button type="button" className="fw-btn fw-danger" onClick={() => setConfirming(m.userId)}>
                      Remove
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
