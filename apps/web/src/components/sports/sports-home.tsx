"use client"

import { SampleLink } from "@web/components/sample/sample-link"
import "@web/components/fantasy/fantasy-workspace.css"
import "@web/components/sports/sports-workspace.css"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Clock, Infinity as Forever, Plus, Users } from "lucide-react"
import { ModePanel } from "@web/components/sports/mode-switch"
import { revealStyle } from "@web/components/motion/reveal"
import { useToast } from "@web/components/ui/toast"
import { SportsStandings } from "@web/components/fantasy/season/list-parts"
import { EmptyScene } from "@web/components/ui/empty-scene"
import { LeagueMark } from "@web/components/league/league-mark"
import { CreateLeagueFlow } from "@web/components/fantasy/create-league-flow"
import { timeLeft } from "@web/components/fantasy/time-left"
import { formatCredits, SPORT_LABEL } from "@web/lib/sports/format"
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
  leaders?: { name: string; credits: number; isYou: boolean }[]
}

/** The Sports side of the Fantasy page: your leagues, start one, or join with a code. */
export function SportsHome() {
  const { data, loading, refetch } = useApi<{ leagues: SportsSummary[] }>("/api/sports/leagues")
  const [mode, setMode] = useState<"none" | "create" | "join">("none")

  return (
    <>
      <header className="fw-intro reveal" style={revealStyle(0)}>
        <div>
          <span className="fw-eyebrow">Pregame picks. Play money.</span>
          <h1>Sports leagues</h1>
          <p className="fw-lede">Everyone starts with the same play cash. Back your picks on NFL, NBA, NHL, MLB, MLS and college football, and climb the standings. Lines are fixed contest lines, not live odds. No real money, ever.</p>
        </div>
        <div className="fw-actions">
          <span className="fw-pill">Play money</span>
          <button type="button" className="fw-btn" data-solid aria-expanded={mode === "create"} onClick={() => setMode(mode === "create" ? "none" : "create")}>
            <Plus aria-hidden /> Start sports league
          </button>
          <button type="button" className="fw-btn" aria-expanded={mode === "join"} onClick={() => setMode(mode === "join" ? "none" : "join")}>
            Join with a code
          </button>
        </div>
      </header>

      <ModePanel mode="sports">
      {mode === "create" ? <CreateLeagueFlow kind="sports" onClose={() => setMode("none")} /> : null}
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
                  <LeagueMark value={league.emoji} accent={league.accent} size={36} />
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
                  <strong>{formatCredits(league.credits)}</strong>
                  <span className="fw-note">Cash</span>
                </div>
                <ArrowRight aria-hidden />
                <SportsStandings leaders={league.leaders ?? []} total={league.memberCount} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyScene
          kind="picks"
          title="No sports leagues yet"
          body="Start one and drop the link in the group chat."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" className="fw-btn" data-solid onClick={() => setMode("create")}>
                <Plus aria-hidden /> Start sports league
              </button>
              <SampleLink href="/fantasy/sports/sample">See a sample league</SampleLink>
            </div>
          }
        />
      )}
      </ModePanel>
    </>
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
