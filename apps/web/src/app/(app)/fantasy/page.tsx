"use client"

import "@web/components/fantasy/fantasy-workspace.css"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Clock, Infinity as Forever, Plus, Trophy, Users } from "lucide-react"
import { formatPercent } from "@web/lib/format"
import { visibleReturn } from "@web/lib/return-display"
import { revealStyle } from "@web/components/motion/reveal"
import { useToast } from "@web/components/ui/toast"
import { mutate, useApi } from "@web/lib/use-api"
import { timeLeft } from "@web/components/fantasy/time-left"
import { Choice, Row } from "@web/components/fantasy/choice"
import { LookPicker } from "@web/components/fantasy/league-look-picker"
import { FantasyEmpty, RoundMeta, SeasonFormatRow } from "@web/components/fantasy/season/list-parts"
import type { RoundChip } from "@web/lib/fantasy-season-view"

type FantasySummary = {
  id: string
  name: string
  emoji: string
  accent: string
  endsAt: string | null
  isClosed: boolean
  memberCount: number
  yourReturn: number
  yourRank?: number | null
  round?: RoundChip | null
}

export default function FantasyPage() {
  const { data, loading, refetch } = useApi<{ leagues: FantasySummary[] }>("/api/fantasy")
  const [mode, setMode] = useState<"none" | "create" | "join">("none")

  return (
    <div className="fw">
      <header className="fw-intro reveal" style={revealStyle(0)}>
        <div>
          <span className="fw-eyebrow">The market. Your group chat.</span>
          <h1>Fantasy leagues</h1>
          <p className="fw-lede">Everyone starts with the same cash. Pick your stocks, compete with friends, and let the returns talk.</p>
        </div>
        <div className="fw-actions">
          <span className="fw-pill">Play money</span>
          <button type="button" className="fw-btn" data-solid aria-expanded={mode === "create"} onClick={() => setMode(mode === "create" ? "none" : "create")}>
            <Plus aria-hidden /> Start fantasy league
          </button>
          <button type="button" className="fw-btn" aria-expanded={mode === "join"} onClick={() => setMode(mode === "join" ? "none" : "join")}>
            Join with a code
          </button>
        </div>
      </header>

      {mode === "create" ? <CreateForm onCancel={() => setMode("none")} /> : null}
      {mode === "join" ? <JoinForm onDone={() => { setMode("none"); void refetch() }} /> : null}

      {loading && !data ? (
        <div className="space-y-3">
          <div className="fw-skeleton animate-pulse" />
          <div className="fw-skeleton animate-pulse" />
        </div>
      ) : data && data.leagues.length > 0 ? (
        <ul className="fw-leagues">
          {data.leagues.map((league, i) => {
            const shown = visibleReturn(league.yourReturn, 2)
            return (
              <li key={league.id} className="reveal" style={revealStyle(i + 1)}>
                <Link href={`/fantasy/${league.id}`} className="fw-league">
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
                      {(league.round?.mode === "draft" ? league.round.seasonRank : league.yourRank) && league.memberCount > 1 ? (
                        <span>
                          <Trophy aria-hidden />
                          <span className="numeric">#{league.round?.mode === "draft" ? league.round.seasonRank : league.yourRank}</span> of {league.memberCount}
                        </span>
                      ) : null}
                      <RoundMeta round={league.round} />
                      <span>
                        {league.endsAt ? <Clock aria-hidden /> : <Forever aria-hidden />}
                        {league.isClosed ? "Final" : league.endsAt ? timeLeft(league.endsAt) : "All-time"}
                      </span>
                    </p>
                  </div>
                  {league.round?.mode === "draft" ? (
                    <div className="fw-league-return">
                      <strong>{league.round.seasonPoints ?? 0}</strong>
                      <span className="fw-note">Season points</span>
                    </div>
                  ) : (
                    <div className="fw-league-return">
                      <strong className={shown > 0 ? "fw-up" : shown < 0 ? "fw-down" : undefined}>{formatPercent(league.yourReturn, 2)}</strong>
                      <span className="fw-note">Your return</span>
                    </div>
                  )}
                  <ArrowRight aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <FantasyEmpty />
      )}
    </div>
  )
}

const CASH = [10_000, 100_000, 1_000_000]
const DURATIONS = [
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
  { label: "All-time", days: null },
] as const
const CAPS = [
  { label: "No cap", value: null },
  { label: "25%", value: 25 },
  { label: "10%", value: 10 },
] as const

function CreateForm({ onCancel }: { onCancel: () => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [look, setLook] = useState({ emoji: "🏈", accent: "emerald" })
  const [cash, setCash] = useState(100_000)
  const [days, setDays] = useState<number | null>(30)
  const [cap, setCap] = useState<number | null>(null)
  const [format, setFormat] = useState<{ mode: "trading" | "draft"; picks: number }>({ mode: "trading", picks: 5 })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await mutate<{ league: { id: string } }>("/api/fantasy", {
        body: {
          name,
          emoji: look.emoji,
          accent: look.accent,
          startingCash: cash,
          maxPositionPct: cap,
          endsAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
          season: { mode: format.mode, rounds: null, picks: format.picks },
        },
      })
      window.location.href = `/fantasy/${result.league.id}`
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't create that league.", "error")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="fw-form animate-rise-in">
      <div>
        <label htmlFor="fantasy-name">League name</label>
        <input
          id="fantasy-name"
          required
          minLength={2}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wolves of Main Street"
          className="fw-input"
        />
      </div>
      <LookPicker look={look} name={name} onChange={setLook} />
      <Row label="Starting cash (same for everyone)">
        {CASH.map((c) => (
          <Choice key={c} active={cash === c} onClick={() => setCash(c)}>
            ${c.toLocaleString()}
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
      <SeasonFormatRow mode={format.mode} picks={format.picks} onChange={setFormat} />
      <Row label="Biggest single pick">
        {CAPS.map((c) => (
          <Choice key={c.label} active={cap === c.value} onClick={() => setCap(c.value)}>
            {c.label}
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
      await mutate("/api/fantasy/join", { body: { code } })
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
      <input
        aria-label="Invite code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="INVITE CODE"
        className="fw-input numeric"
      />
      <button type="submit" className="fw-btn" data-solid disabled={saving} aria-busy={saving || undefined}>
        {saving ? "Joining…" : "Join"}
      </button>
    </form>
  )
}
