"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "./sports-workspace.css"
import "./market-board.css"
import { useMemo, useState } from "react"
import { TeamBadge } from "@web/components/sports/team-badge"
import { LeagueBrand } from "@web/components/sports/league-brand"
import { matchupColors } from "@web/lib/sports/matchup-colors"
import { gameChart } from "@web/lib/sports/live/trend"
import { formatOdds } from "@web/lib/sports/format"
import { onColor } from "@web/lib/sports/teams"

type Game = { id: string; sport: string; away: string; home: string; live: boolean; detail: string; awayScore?: number; homeScore?: number; awayRec?: string; homeRec?: string; homeProb: number; awayOdds: number; homeOdds: number; vol: string; when?: string }

const G: Game[] = [
  { id: "1", sport: "nfl", away: "Dallas Cowboys", home: "Green Bay Packers", live: true, detail: "Q3 5:02", awayScore: 7, homeScore: 20, awayRec: "2-3", homeRec: "3-2", homeProb: 0.83, awayOdds: 480, homeOdds: -550, vol: "14.8M" },
  { id: "2", sport: "nba", away: "New York Knicks", home: "Boston Celtics", live: true, detail: "Q4 2:31", awayScore: 95, homeScore: 98, homeProb: 0.57, awayOdds: 125, homeOdds: -150, vol: "2.1M" },
  { id: "3", sport: "mlb", away: "San Diego Padres", home: "Los Angeles Dodgers", live: true, detail: "Top 7th", awayScore: 1, homeScore: 3, homeProb: 0.74, awayOdds: 260, homeOdds: -290, vol: "980K" },
  { id: "4", sport: "nhl", away: "Dallas Stars", home: "Colorado Avalanche", live: true, detail: "End of 1st", awayScore: 2, homeScore: 2, homeProb: 0.52, awayOdds: 105, homeOdds: -125, vol: "430K" },
  { id: "5", sport: "mls", away: "LA Galaxy", home: "Seattle Sounders FC", live: true, detail: "72'", awayScore: 1, homeScore: 1, homeProb: 0.41, awayOdds: 230, homeOdds: 190, vol: "210K" },
  { id: "6", sport: "nfl", away: "Washington Commanders", home: "San Francisco 49ers", live: false, detail: "", when: "Mon 8:15 PM", homeProb: 0.8, awayOdds: 330, homeOdds: -400, vol: "705K" },
  { id: "7", sport: "nfl", away: "Miami Dolphins", home: "New York Jets", live: false, detail: "", when: "Sun 1:00 PM", homeProb: 0.7, awayOdds: 110, homeOdds: -130, vol: "55K" },
  { id: "8", sport: "nfl", away: "Cleveland Browns", home: "Tennessee Titans", live: false, detail: "", when: "Sun 1:00 PM", homeProb: 0.47, awayOdds: -115, homeOdds: 105, vol: "40K" },
  { id: "9", sport: "nba", away: "Los Angeles Lakers", home: "Golden State Warriors", live: false, detail: "", when: "Tue 10:00 PM", homeProb: 0.57, awayOdds: 125, homeOdds: -150, vol: "1.2M" },
  { id: "10", sport: "nba", away: "Denver Nuggets", home: "Phoenix Suns", live: false, detail: "", when: "Tue 10:30 PM", homeProb: 0.38, awayOdds: -170, homeOdds: 145, vol: "640K" },
  { id: "11", sport: "mlb", away: "Atlanta Braves", home: "Houston Astros", live: false, detail: "", when: "Wed 7:40 PM", homeProb: 0.51, awayOdds: 100, homeOdds: -115, vol: "310K" },
  { id: "12", sport: "nhl", away: "Boston Bruins", home: "Toronto Maple Leafs", live: false, detail: "", when: "Wed 7:00 PM", homeProb: 0.46, awayOdds: -105, homeOdds: -115, vol: "190K" },
]

const short = (n: string) => n.split(" ").slice(-1)[0]!
const pct = (p: number) => `${Math.round(p * 100)}%`

/** A believable win-chance history that ends at the game's current chance. */
function series(g: Game) {
  const n = 36
  const seed = Number(g.id) * 7
  const pts = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    const drift = 0.5 + (g.homeProb - 0.5) * (g.live ? t ** 1.4 : 1)
    const wob = Math.sin(i * 0.9 + seed) * 0.035 * (g.live ? 1 : 0.4) + Math.sin(i * 0.37 + seed * 2) * 0.02
    return { t: i * 120_000, v: Math.min(0.97, Math.max(0.03, i === n - 1 ? g.homeProb : drift + wob)) }
  })
  return pts
}

function Tint({ g, children, className }: { g: Game; children: React.ReactNode; className: string }) {
  const [a, h] = matchupColors(g.sport, g.away, g.home)
  return <article className={className} data-live={g.live || undefined} style={{ "--a": a, "--h": h } as React.CSSProperties}>{children}</article>
}
const Head = ({ g }: { g: Game }) => (
  <div className="mk-head">
    {g.live ? <span className="mk-live"><i />{g.detail}</span> : <span>{g.when}</span>}
    <span className="mk-meta"><LeagueBrand sport={g.sport} /><b>{g.vol}</b></span>
  </div>
)

function CardA({ g }: { g: Game }) {
  return (
    <Tint g={g} className="mk-card mk-a">
      <Head g={g} />
      {([["away", g.away, g.awayScore, 1 - g.homeProb, g.awayRec], ["home", g.home, g.homeScore, g.homeProb, g.homeRec]] as const).map(([k, name, score, p, rec]) => (
        <div key={k} className="mk-row" data-side={k} data-lead={p > 0.5 || undefined}>
          <TeamBadge sport={g.sport} name={name} size={30} />
          <span className="mk-name"><b>{name}</b>{rec ? <small>{rec}</small> : null}</span>
          <span className="mk-pct numeric">{pct(p)}</span>
          {g.live ? <span className="mk-score numeric">{score}</span> : null}
        </div>
      ))}
      <div className="mk-bar" aria-hidden><i style={{ width: pct(1 - g.homeProb), background: "var(--a)" }} /><i style={{ width: pct(g.homeProb), background: "var(--h)" }} /></div>
    </Tint>
  )
}

function CardB({ g }: { g: Game }) {
  const geo = useMemo(() => gameChart(series(g), g.homeProb, 36 * 120_000, 240, 44), [g])
  const [a, h] = matchupColors(g.sport, g.away, g.home)
  return (
    <Tint g={g} className="mk-card mk-b">
      <Head g={g} />
      {g.live ? <p className="mk-line numeric">{short(g.away)} {g.awayScore} <i>·</i> {short(g.home)} {g.homeScore}</p> : null}
      <div className="mk-odds">
        {([["away", g.away, g.awayOdds, a], ["home", g.home, g.homeOdds, h]] as const).map(([k, name, odds, c]) => (
          <button key={k} type="button" style={{ "--c": c, "--ink": onColor(c) } as React.CSSProperties}>
            <TeamBadge sport={g.sport} name={name} size={26} />
            <span><b>{short(name)}</b><small>{pct(k === "home" ? g.homeProb : 1 - g.homeProb)}</small></span>
            <em className="numeric">{formatOdds(odds)}</em>
          </button>
        ))}
      </div>
      {geo ? (
        <svg className="mk-chart" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden>
          <line x1={0} x2={240} y1={geo.midY} y2={geo.midY} stroke="currentColor" strokeDasharray="2 4" opacity={0.25} vectorEffect="non-scaling-stroke" />
          <path d={geo.away} fill="none" stroke={a} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
          <path d={geo.home} fill="none" stroke={h} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
    </Tint>
  )
}

function CardC({ g }: { g: Game }) {
  return (
    <Tint g={g} className="mk-card mk-c">
      <Head g={g} />
      <div className="mk-vs">
        <div><TeamBadge sport={g.sport} name={g.away} size={46} /><b>{short(g.away)}</b><small>{g.awayRec ?? " "}</small></div>
        <div className="mk-mid">{g.live ? <span className="numeric">{g.awayScore}<i>–</i>{g.homeScore}</span> : <span className="mk-at">at</span>}</div>
        <div><TeamBadge sport={g.sport} name={g.home} size={46} /><b>{short(g.home)}</b><small>{g.homeRec ?? " "}</small></div>
      </div>
      <div className="mk-wp" aria-hidden><i style={{ width: pct(1 - g.homeProb), background: "var(--a)" }} /><i style={{ width: pct(g.homeProb), background: "var(--h)" }} /></div>
      <div className="mk-wl numeric"><span>{pct(1 - g.homeProb)}</span><small>Win chance</small><span>{pct(g.homeProb)}</span></div>
    </Tint>
  )
}

const SPORTS = ["all", "nfl", "nba", "mlb", "nhl", "mls"] as const

export function MarketBoardPreview() {
  const [v, setV] = useState<"a" | "b" | "c">("a")
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("all")
  const [view, setView] = useState<"live" | "upcoming">("live")
  const games = G.filter((g) => (sport === "all" || g.sport === sport) && g.live === (view === "live"))
  const Card = v === "a" ? CardA : v === "b" ? CardB : CardC
  return (
    <section className="fw mk" aria-label="Sports market">
      <header className="mk-top">
        <div><h1>Sports market</h1><p>Live games, win chances and prices in one place. Sample data.</p></div>
        <div className="mk-seg" role="group" aria-label="Card layout">
          {(["a", "b", "c"] as const).map((k) => <button key={k} type="button" aria-pressed={v === k} onClick={() => setV(k)}>{k === "a" ? "A · Rows" : k === "b" ? "B · Odds" : "C · Matchup"}</button>)}
        </div>
      </header>
      <div className="mk-filters">
        <div className="mk-chips" role="group" aria-label="Sport">{SPORTS.map((s) => <button key={s} type="button" aria-pressed={sport === s} onClick={() => setSport(s)}>{s === "all" ? "All" : s.toUpperCase()}</button>)}</div>
        <div className="mk-seg" role="group" aria-label="Status">
          <button type="button" aria-pressed={view === "live"} onClick={() => setView("live")}>Live now</button>
          <button type="button" aria-pressed={view === "upcoming"} onClick={() => setView("upcoming")}>Upcoming</button>
        </div>
      </div>
      <div className="mk-grid" data-v={v}>{games.length ? games.map((g) => <Card key={g.id} g={g} />) : <p className="mk-empty">No games here right now.</p>}</div>
    </section>
  )
}
