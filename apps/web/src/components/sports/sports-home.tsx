"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/sports/sports-workspace.css"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Clock, Infinity as Forever, Plus, Users } from "lucide-react"
import { revealStyle } from "@web/components/motion/reveal"
import { useToast } from "@web/components/ui/toast"
import { Choice, Row } from "@web/components/fantasy/choice"
import { LookPicker } from "@web/components/fantasy/league-look-picker"
import { timeLeft } from "@web/components/fantasy/time-left"
import { SPORT_LABEL } from "@web/lib/sports/format"
import { mutate, useApi } from "@web/lib/use-api"

type SportsSummary = {
  id: string
  name: string
  emoji: string
  accent: string
  sports: string[]
  endsAt: string | null
  isClosed: boolean
  memberCount: number
  credits: number
  startingCredits: number
}

const CREDITS = [500, 1_000, 5_000]
const DURATIONS = [
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
  { label: "Season", days: 120 },
  { label: "No end", days: null },
] as const
const SPORT_OPTIONS = ["nfl", "nba", "tennis"] as const

/** The Sports side of the Fantasy page: your leagues, start one, or join with a code. */
export function SportsHome() {
  const { data, loading, refetch } = useApi<{ leagues: SportsSummary[] }>("/api/sports/leagues")
  const [mode, setMode] = useState<"none" | "create" | "join">("none")

  return (
    <>
      <header className="fw-intro reveal" style={revealStyle(0)}>
        <div>
          <span className="fw-eyebrow">Pregame picks. Play credits.</span>
          <h1>Sports leagues</h1>
          <p className="fw-lede">Everyone starts with the same credits. Back your picks on NFL, NBA and tennis, and climb the standings. No real money, ever.</p>
        </div>
        <div className="fw-actions">
          <span className="fw-pill">Play credits</span>
          <button type="button" className="fw-btn" data-solid aria-expanded={mode === "create"} onClick={() => setMode(mode === "create" ? "none" : "create")}>
            <Plus aria-hidden /> Start sports league
          </button>
          <button type="button" className="fw-btn" aria-expanded={mode === "join"} onClick={() => setMode(mode === "join" ? "none" : "join")}>
            Join with a code
          </button>
        </div>
      </header>

      {mode === "create" ? <CreateForm onCancel={() => setMode("none")} /> : null}
      {mode === "join" ? (
        <JoinForm
          onDone={() => {
            setMode("none")
            void refetch()
          }}
        />
      ) : null}

      {loading && !data ? (
        <div className="space-y-3">
          <div className="fw-skeleton animate-pulse" />
          <div className="fw-skeleton animate-pulse" />
        </div>
      ) : data && data.leagues.length > 0 ? (
        <ul className="fw-leagues">
          {data.leagues.map((league, i) => (
            <li key={league.id} className="reveal" style={revealStyle(i + 1)}>
              <Link href={`/fantasy/sports/${league.id}`} className="fw-league">
                <span className="fw-art" data-accent={league.accent} aria-hidden>
                  <span>{league.emoji}</span>
                </span>
                <div className="fw-league-body">
                  <h2>{league.name}</h2>
                  <p className="fw-league-meta">
                    <span>
                      <Users aria-hidden />
                      <span className="numeric">{league.memberCount}</span> {league.memberCount === 1 ? "player" : "players"}
                    </span>
                    <span>
                      {league.endsAt ? <Clock aria-hidden /> : <Forever aria-hidden />}
                      {league.isClosed ? "Final" : league.endsAt ? timeLeft(league.endsAt) : "No end"}
                    </span>
                    <span>{league.sports.map((s) => SPORT_LABEL[s] ?? s).join(" · ")}</span>
                  </p>
                </div>
                <div className="fw-league-return">
                  <strong>{league.credits.toLocaleString()}</strong>
                  <span className="fw-note">Credits</span>
                </div>
                <ArrowRight aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="fw-empty-state">
          <svg className="fw-empty-art" viewBox="0 0 120 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 56h104" opacity=".4" />
            <ellipse cx="60" cy="30" rx="26" ry="16" />
            <path d="M44 30h32M60 14v32" opacity=".6" />
          </svg>
          <p>No sports leagues yet. Start one and drop the link in the group chat.</p>
        </div>
      )}
    </>
  )
}

function CreateForm({ onCancel }: { onCancel: () => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [look, setLook] = useState({ emoji: "🏈", accent: "emerald" })
  const [credits, setCredits] = useState(1_000)
  const [days, setDays] = useState<number | null>(30)
  const [sports, setSports] = useState<string[]>(["nfl"])

  const toggle = (s: string) => setSports((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (sports.length === 0) {
      toast("Pick at least one sport.", "error")
      return
    }
    setSaving(true)
    try {
      const result = await mutate<{ league: { id: string } }>("/api/sports/leagues", {
        body: {
          name,
          emoji: look.emoji,
          accent: look.accent,
          sports,
          startingCredits: credits,
          endsAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
        },
      })
      window.location.href = `/fantasy/sports/${result.league.id}`
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't create the league.", "error")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="fw-form animate-rise-in">
      <div>
        <label htmlFor="sports-name">League name</label>
        <input id="sports-name" required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday Sharps" className="fw-input" />
      </div>
      <LookPicker look={look} name={name} onChange={setLook} />
      <Row label="Sports">
        {SPORT_OPTIONS.map((s) => (
          <Choice key={s} active={sports.includes(s)} onClick={() => toggle(s)}>
            {SPORT_LABEL[s]}
          </Choice>
        ))}
      </Row>
      <Row label="Starting credits (same for everyone)">
        {CREDITS.map((c) => (
          <Choice key={c} active={credits === c} onClick={() => setCredits(c)}>
            {c.toLocaleString()}
          </Choice>
        ))}
      </Row>
      <Row label="How long">
        {DURATIONS.map((d) => (
          <Choice key={d.label} active={days === d.days} onClick={() => setDays(d.days)}>
            {d.label}
          </Choice>
        ))}
      </Row>
      <div className="fw-form-actions">
        <button type="button" className="fw-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="fw-btn" data-solid disabled={saving} aria-busy={saving || undefined}>
          {saving ? "Creating…" : "Create league"}
        </button>
      </div>
    </form>
  )
}

function JoinForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const [code, setCode] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await mutate("/api/sports/leagues/join", { body: { code } })
      toast("You're in. Go make some picks.", "success")
      onDone()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't join.", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="fw-form fw-form-inline animate-rise-in">
      <input aria-label="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="INVITE CODE" className="fw-input numeric" />
      <button type="submit" className="fw-btn" data-solid disabled={saving} aria-busy={saving || undefined}>
        {saving ? "Joining…" : "Join"}
      </button>
    </form>
  )
}
