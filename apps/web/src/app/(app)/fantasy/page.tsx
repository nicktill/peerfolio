"use client"

import { SampleLink } from "@web/components/sample/sample-link"
import "@web/components/fantasy/fantasy-workspace.css"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Clock, Infinity as Forever, Plus, Trophy, Users } from "lucide-react"
import { formatPercent } from "@web/lib/format"
import { visibleReturn } from "@web/lib/return-display"
import { LeagueMark } from "@web/components/league/league-mark"
import { InfoTip, Tip } from "@web/components/ui/tip"
import { revealStyle } from "@web/components/motion/reveal"
import { useToast } from "@web/components/ui/toast"
import { mutate, useApi } from "@web/lib/use-api"
import { timeLeft } from "@web/components/fantasy/time-left"
import { CreateLeagueFlow } from "@web/components/fantasy/create-league-flow"
import { FantasyEmpty, ListStandings, RoundMeta } from "@web/components/fantasy/season/list-parts"
import type { RoundChip } from "@web/lib/fantasy-season-view"
import dynamic from "next/dynamic"
import { ModePanel, ModeSwitch, WorldAmbient, useFantasyMode } from "@web/components/sports/mode-switch"

// Loaded only when someone opens the Sports side, so the flag-off Fantasy bundle carries no sports code or CSS.
const SportsHome = dynamic(() => import("@web/components/sports/sports-home").then((m) => m.SportsHome), { ssr: false })

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
  longLeaders?: { name: string | null; image: string | null; percent: number; rank: number; isYou: boolean }[]
  round?: RoundChip | null
}

export default function FantasyPage() {
  const { data, loading, refetch } = useApi<{ leagues: FantasySummary[] }>("/api/fantasy")
  const [mode, setMode] = useState<"none" | "create" | "join">("none")
  const [side, setSide] = useFantasyMode()

  // Sports sits behind the sports flag (useSportsEnabled: everyone, or admins only); when it is off for this user `side` is always "stocks" and the switch renders nothing.
  if (side === "sports") {
    return (
      <div className="fw" data-world="sports">
        <WorldAmbient world="sports" />
        <ModeSwitch mode={side} onChange={setSide} />
        <SportsHome />
      </div>
    )
  }

  return (
    <div className="fw" data-world="stocks">
      <WorldAmbient world="stocks" />
      <ModeSwitch mode={side} onChange={setSide} />
      <header className="fw-intro reveal" style={revealStyle(0)}>
        <div>
          <span className="fw-eyebrow">The market. Your group chat.</span>
          <h1>Fantasy leagues</h1>
          <p className="fw-lede">Everyone starts with the same cash. Pick your stocks, compete with friends, and let the returns talk.</p>
        </div>
        <div className="fw-actions">
          <span className="fw-pill">Play money<InfoTip text="Everyone trades with virtual cash. Nothing real is at stake." label="About play money" /></span>
          <button type="button" className="fw-btn" data-solid aria-expanded={mode === "create"} onClick={() => setMode(mode === "create" ? "none" : "create")}>
            <Plus aria-hidden /> Start fantasy league
          </button>
          <button type="button" className="fw-btn" aria-expanded={mode === "join"} onClick={() => setMode(mode === "join" ? "none" : "join")}>
            Join with a code
          </button>
        </div>
      </header>

      {mode === "create" ? <CreateLeagueFlow onClose={() => setMode("none")} /> : null}
      <ModePanel mode={side}>
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
                    <LeagueMark value={league.emoji} accent={league.accent} size={36} />
                  </span>
                  <div className="fw-league-body">
                    <h2>
                      {league.name}
                      {league.round ? (
                        <Tip text="Weekly seasons are on: every week is its own scoreboard and the best week earns the most points. The Season half below shows those points. Long race is total return since the start.">
                          <span className="fw-season-pill">
                            <i aria-hidden /> Seasons on
                          </span>
                        </Tip>
                      ) : null}
                    </h2>
                    <p className="fw-league-meta">
                      <Tip text="Players in this league">
                        <span>
                          <Users aria-hidden />
                          <span className="numeric">{league.memberCount}</span> {league.memberCount === 1 ? "player" : "players"}
                        </span>
                      </Tip>
                      {league.yourRank && league.memberCount > 1 ? (
                        <Tip text={`You are #${league.yourRank} of ${league.memberCount} by total return`}>
                          <span>
                            <Trophy aria-hidden />
                            <span className="numeric">#{league.yourRank}</span> of {league.memberCount}
                          </span>
                        </Tip>
                      ) : null}
                      <RoundMeta round={league.round} />
                      <Tip text={league.endsAt ? "Time until this league ends" : "All-time: no end date"}>
                        <span>
                          {league.endsAt ? <Clock aria-hidden /> : <Forever aria-hidden />}
                          {league.isClosed ? "Final" : league.endsAt ? timeLeft(league.endsAt) : "All-time"}
                        </span>
                      </Tip>
                    </p>
                  </div>
                  <div className="fw-league-return">
                    <strong className={shown > 0 ? "fw-up" : shown < 0 ? "fw-down" : undefined}>{formatPercent(league.yourReturn, 2)}</strong>
                    <span className="fw-note">Your return</span>
                  </div>
                  <ArrowRight aria-hidden />
                  <ListStandings race={league.longLeaders ?? []} raceYou={league.yourRank ?? null} total={league.memberCount} season={league.round && (league.round.leaders?.length ?? 0) > 0 ? league.round : null} />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <FantasyEmpty
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" className="fw-btn" data-solid onClick={() => setMode("create")}>
                <Plus aria-hidden /> Start fantasy league
              </button>
              <SampleLink href="/fantasy/sample">See a sample league</SampleLink>
            </div>
          }
        />
      )}
      </ModePanel>
    </div>
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
