"use client"

import { useEffect, useState } from "react"
import { TeamBadge } from "@web/components/sports/team-badge"
import { useApi } from "@web/lib/use-api"
import { sampleActive } from "@web/lib/sample/fixtures"
import type { ScoreGame } from "@web/lib/sports/scoreboard"

const SCOREBOARD = "/api/sports/scoreboard?sports=cfb,mlb,mls,nba,nfl,nhl,tennis"
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET"

/** Real scoreboard snapshots. Motion decorates the pills; scores only change when ESPN reports them. */
export function ArenaMatchups() {
  const { data, error, loading } = useApi<{ games: ScoreGame[]; failedSports: string[] }>(SCOREBOARD, [], { refreshMs: 30_000 })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [])
  const games = data?.games ?? []
  const live = games.filter(g => g.status === "live")
  const finals = games.filter(g => g.status === "final").sort((a,b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
  const upcoming = games.filter(g => g.status === "upcoming" && Date.parse(g.startsAt) > now).sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  // Prefer games happening now, then recent finals, then scheduled games. Never invent matchups.
  const shown = [...live, ...finals, ...upcoming].slice(0, 2)
  if (!shown.length) return <span className="am"><span className="am-card am-empty" data-k="0">{loading ? "Checking scores…" : error || data?.failedSports.length ? "Scores unavailable" : "No games scheduled"}</span></span>
  return (
    <span className="am">
      {shown.map((g, i) => {
        const age = now - Date.parse(g.fetchedAt)
        const fresh = Number.isFinite(age) && age >= -5_000 && age < 120_000
        const sample = sampleActive()
        const label = sample ? "Sample" : g.status === "live" ? fresh ? "Live" : "Delayed" : g.status === "final" ? "Final" : time(g.startsAt)
        const scored = g.status === "live" || g.status === "final"
        return (
          <span key={`${g.sport}:${g.id}`} className="am-card" data-k={i} title={`${g.away} ${g.sport === "tennis" ? "vs" : "at"} ${g.home} · ${g.detail} · ${label}`}>
            <TeamBadge sport={g.sport} name={g.away} size={24} bare />
            {scored ? <b className="numeric"><span key={g.awayScore} className="roll">{g.awayScore ?? "–"}</span></b> : null}
            <i>vs</i>
            {scored ? <b className="numeric"><span key={g.homeScore} className="roll">{g.homeScore ?? "–"}</span></b> : null}
            <TeamBadge sport={g.sport} name={g.home} size={24} bare />
            <small className="am-status" data-live={g.status === "live" && fresh && !sample || undefined}>{label}</small>
          </span>
        )
      })}
    </span>
  )
}
