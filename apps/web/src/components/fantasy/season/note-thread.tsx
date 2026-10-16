"use client"

import { useState } from "react"
import { useToast } from "@web/components/ui/toast"
import { mutate } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import type { NoteView } from "@web/lib/fantasy-notes"

/** The same six as the standings. */
const REACTIONS = ["🔥", "🚀", "👏", "🧊", "🤝", "😤"] as const
const MAX = 280

const firstName = (a: { name: string | null; handle: string | null }) => a.name?.split(" ")[0] ?? a.handle ?? "Someone"

/**
 * "Why I picked this" under a trade or a pick: the note, emoji reactions and a
 * short thread of replies. The author of a trade or pick with no note yet gets
 * a quiet "Add why" link instead.
 */
export function NoteThread({
  leagueId,
  note,
  target,
  onChanged,
}: {
  leagueId: string
  note: NoteView | null
  /** Set when the viewer owns the trade or pick, so they can write or rewrite the note. */
  target?: { tradeId?: string; pickId?: string }
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState("")
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState("")
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true)
    try {
      await action()
      onChanged()
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : fallback, "error")
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveNote = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!target || !draft.trim()) return
    if (await run(() => mutate(`/api/fantasy/${leagueId}/notes`, { body: { ...target, body: draft } }), "Couldn't save that.")) {
      setWriting(false)
      setDraft("")
    }
  }

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!note || !reply.trim()) return
    if (await run(() => mutate(`/api/fantasy/${leagueId}/notes/${note.id}/replies`, { body: { body: reply } }), "Couldn't send that.")) setReply("")
  }

  const react = (emoji: string) => {
    if (!note) return
    setPicker(false)
    void run(() => mutate(`/api/fantasy/${leagueId}/notes/${note.id}/react`, { body: { emoji } }), "Couldn't react.")
  }

  if (!note && !writing) {
    return target ? (
      <div className="fs-note" style={{ borderLeftColor: "transparent", paddingTop: 2 }}>
        <button type="button" className="fs-add-note" onClick={() => setWriting(true)}>
          Add why
        </button>
      </div>
    ) : null
  }

  if (!note) {
    return (
      <form className="fs-note fs-why-field" onSubmit={saveNote}>
        <input
          className="fw-input fs-why"
          autoFocus
          value={draft}
          maxLength={MAX}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Why this one?"
          aria-label="Why did you pick this?"
        />
        <div className="fs-compose" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="fw-btn" onClick={() => setWriting(false)}>
            Cancel
          </button>
          <button type="submit" className="fw-btn" data-solid disabled={busy || !draft.trim()}>
            Post
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="fs-note">
      <p className="fs-note-body">{note.body}</p>
      <div className="fs-note-bar">
        {note.reactions.map((r) => (
          <button key={r.emoji} type="button" className="fw-react numeric" data-on={r.mine || undefined} aria-pressed={r.mine} onClick={() => react(r.emoji)}>
            <span aria-hidden>{r.emoji}</span>
            {r.count}
          </button>
        ))}
        <div className="fw-react-add">
          <button type="button" className="fw-react" onClick={() => setPicker(!picker)} aria-expanded={picker} aria-label="React to this note">
            +
          </button>
          {picker ? (
            <div className="fw-react-menu">
              {REACTIONS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => react(emoji)}>
                  <span aria-hidden>{emoji}</span>
                  <span className="sr-only">React with {emoji}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className="fs-add-note" style={{ marginLeft: 6 }} onClick={() => setReplying(!replying)} aria-expanded={replying}>
          {note.replies.length > 0 ? `${note.replies.length} ${note.replies.length === 1 ? "reply" : "replies"}` : "Reply"}
        </button>
      </div>
      {replying || note.replies.length > 0 ? (
        <ul className="fs-replies">
          {note.replies.map((r) => (
            <li key={r.id} className={cn("fs-reply")}>
              <b>{r.isYours ? "You" : firstName(r.author)}</b> {r.body}
            </li>
          ))}
        </ul>
      ) : null}
      {replying ? (
        <form className="fs-compose" onSubmit={sendReply}>
          <input className="fw-input" value={reply} maxLength={MAX} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" aria-label="Reply" />
          <button type="submit" className="fw-btn" data-solid disabled={busy || !reply.trim()}>
            Send
          </button>
        </form>
      ) : null}
    </div>
  )
}
