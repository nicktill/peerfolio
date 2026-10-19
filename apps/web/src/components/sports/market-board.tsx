"use client"

import "@web/components/fantasy/fantasy-workspace.css"
import "./sports-workspace.css"
import "./market-board.css"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { TeamBadge } from "@web/components/sports/team-badge"
import { LeagueBrand } from "@web/components/sports/league-brand"
import { GameStatusChip, statusInputFromGame } from "@web/components/sports/game-status-chip"
import { HistoryTrack, useGameHistory } from "@web/components/sports/odds-trend"
import { useLiveGame } from "@web/components/sports/live-game"
import { matchupColors } from "@web/lib/sports/matchup-colors"
import { mergeLiveState } from "@web/lib/sports/game-status"
import { mergeLiveScores, scoreboardMatch, type ScoreGame } from "@web/lib/sports/scoreboard"
import { americanToProb } from "@web/lib/sports/odds"
import { splitPct } from "@web/lib/sports/live/format"
import { oddsLabel } from "@web/lib/sports/teams"
import { SPORT_LABEL } from "@web/lib/sports/format"
import { inSampleView } from "@web/lib/sample/fixtures"
import { useApi } from "@web/lib/use-api"

type LeagueSummary = { id: string; name: string; sports: string[]; isClosed: boolean }
type TrackedEvent = { id: string; sport: string; home: string; away: string; startsAt: string }
type LineRow = { selection: string; price: number }
type MarketRow = { kind: string; event: { sport: string; home: string; away: string; startsAt: string }; lines: LineRow[] }
type Detail = { liveEvents?: TrackedEvent[]; markets: MarketRow[] }

const DEFAULT_SPORTS = ["nfl", "nba", "mlb", "nhl", "mls", "epl", "laliga", "ucl", "wnba"]
const SAMPLE_LEAGUE: LeagueSummary = { id: "sample", name: "Demo Sharps", sports: ["nfl", "nba", "mlb", "nhl", "mls"], isClosed: false }
const KEY = "pf.market.league"
const pct = (n: number) => `${n}%`

/** Moneyline prices as a vig-free split (home + away = 100), for games that have not started. */
function impliedSplit(lines: LineRow[]): { home: number; away: number } | null {
  const home = lines.find((l) => l.selection === "home")?.price
  const away = lines.find((l) => l.selection === "away")?.price
  if (home == null || away == null) return null
  const h = americanToProb(home)
  const a = americanToProb(away)
  return splitPct(h / (h + a))
}

function MarketCard({ g, tracked, split: pregame, href, now }: { g: ScoreGame; tracked?: TrackedEvent; split: { home: number; away: number } | null; href: string | null; now: number }) {
  const live = g.status === "live"
  const fresh = now - Date.parse(g.fetchedAt) < 120_000
  const { view } = useLiveGame(tracked?.id, live && fresh)
  const history = useGameHistory(live && fresh ? tracked?.id : undefined)
  const [awayColor, homeColor] = matchupColors(g.sport, g.away, g.home)
  // Live: the exchange view wins, then ESPN's in-game odds. Upcoming: the pregame moneyline.
  const exchange = live && view?.odds.status === "ok" ? view.odds : null
  const split = exchange && exchange.drawProb == null ? splitPct(exchange.homeProb)
    : live && fresh && g.probSource === "espn" && g.homeWinProb != null && g.drawProb == null ? splitPct(g.homeWinProb)
    : !live ? pregame ?? (g.pregameHome != null && g.pregameDraw == null ? splitPct(g.pregameHome) : null) : null
  const status = mergeLiveState(statusInputFromGame(g), view)
  const body = (
    <>
      <div className="mk-head">
        {live ? <GameStatusChip input={status} now={now} /> : <span className="mk-when">{new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(g.startsAt))}</span>}
        <span className="mk-meta"><LeagueBrand sport={g.sport} /></span>
      </div>
      <div className="mk-vs">
        <div><TeamBadge sport={g.sport} name={g.away} size={46} /><b>{oddsLabel(g.sport, g.away)}</b><small>{g.awayRecord ?? " "}</small></div>
        <div className="mk-mid">{live ? <span className="numeric">{g.awayScore ?? "–"}<i>–</i>{g.homeScore ?? "–"}</span> : <span className="mk-at">{g.sport === "tennis" ? "vs" : "at"}</span>}</div>
        <div><TeamBadge sport={g.sport} name={g.home} size={46} /><b>{oddsLabel(g.sport, g.home)}</b><small>{g.homeRecord ?? " "}</small></div>
      </div>
      {split ? (
        <div className="mk-split" role="img" aria-label={`Win chance: ${g.away} ${split.away} percent, ${g.home} ${split.home} percent`}>
          <div className="mk-track" data-history={history.length ? "" : undefined}>
            <i style={{ width: pct(split.away), background: awayColor }} />
            <i style={{ flex: 1, background: homeColor }} />
            {live ? <HistoryTrack series={history} live={split.home / 100} awayColor={awayColor} homeColor={homeColor} /> : null}
          </div>
          <div className="mk-labels numeric"><span><b>{pct(split.away)}</b></span><small>{live ? "Win chance" : "Pregame odds"}</small><span><b>{pct(split.home)}</b></span></div>
        </div>
      ) : <div className="mk-split mk-split-none">
          <div className="mk-track" aria-hidden />
          <div className="mk-labels"><small>{live ? "Win chance isn't available for this game yet" : "Pregame odds aren't posted yet"}</small></div>
        </div>}
    </>
  )
  const cls = "mk-card mk-d"
  const style = { "--a": awayColor, "--h": homeColor } as React.CSSProperties
  return href
    ? <Link href={href} className={cls} data-sport={g.sport} data-live={live || undefined} style={style} aria-label={`${g.away} at ${g.home}. Open to pick.`}>{body}</Link>
    : <article className={cls} data-sport={g.sport} data-live={live || undefined} style={style}>{body}</article>
}

/** A browsable board of every game across your leagues' sports: live and upcoming, filtered by sport. Tapping a card opens that game in your league's pick screen. */
export function MarketBoard() {
  const pathname = usePathname()
  const sample = inSampleView(pathname ?? "")
  const leagues = useApi<{ leagues: LeagueSummary[] }>(sample ? null : "/api/sports/leagues")
  const mine = sample ? [SAMPLE_LEAGUE] : (leagues.data?.leagues ?? []).filter((l) => !l.isClosed)
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => {
    try { setPicked(window.localStorage.getItem(KEY)) } catch { /* storage blocked: first league */ }
  }, [])
  const league = mine.find((l) => l.id === picked) ?? mine[0] ?? null
  const choose = (id: string) => {
    setPicked(id)
    try { window.localStorage.setItem(KEY, id) } catch { /* not remembered */ }
  }

  const detail = useApi<Detail>(league ? `/api/sports/leagues/${league.id}` : null, [league?.id], { refreshMs: 30_000 })
  const sports = league?.sports ?? DEFAULT_SPORTS
  const sportsKey = [...sports].sort().join(",")
  const scores = useApi<{ games: ScoreGame[]; failedSports: string[] }>(leagues.loading && !sample ? null : `/api/sports/scoreboard?sports=${sportsKey}`, [sportsKey, leagues.loading], { refreshMs: 30_000 })
  const liveKey = [...new Set((scores.data?.games ?? []).filter((g) => g.status === "live").map((g) => g.sport))].sort().join(",")
  const liveScores = useApi<{ games: ScoreGame[]; failedSports: string[] }>(liveKey ? `/api/sports/scoreboard?sports=${liveKey}&live=1` : null, [liveKey], { refreshMs: 10_000 })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [])

  const games = useMemo(() => mergeLiveScores(scores.data?.games ?? [], liveScores.data?.games ?? []), [scores.data, liveScores.data])
  const liveCount = games.filter((g) => g.status === "live").length
  const [view, setView] = useState<"live" | "upcoming" | null>(null)
  const shownView = view ?? (liveCount > 0 || !games.length ? "live" : "upcoming")
  const [sport, setSport] = useState("all")
  const [group, setGroup] = useState<"league" | "time">("league")
  const present = [...new Set([...sports, ...games.map((g) => g.sport)])].filter((s) => games.some((g) => g.sport === s) || sports.includes(s))
  const shown = games
    .filter((g) => (sport === "all" || g.sport === sport) && (shownView === "live" ? g.status === "live" : g.status === "upcoming" && Date.parse(g.startsAt) > now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 60)
  const base = sample ? "/preview/sports/sample" : league ? `/fantasy/sports/${league.id}` : null
  const failed = (!scores.data && !!scores.error) || (scores.data?.failedSports ?? []).length > 0

  return (
    <section className="fw mk" aria-label="Sports market">
      <header className="mk-top">
        <div>
          <h1>Sports market</h1>
          <p>{league ? <>Tap a game to pick it in <b>{league.name}</b>.</> : "Live games, win chances and prices in one place."}</p>
        </div>
        {mine.length > 1 ? (
          <label className="mk-league">
            <span className="sr-only">League for picks</span>
            <select value={league?.id ?? ""} onChange={(e) => choose(e.target.value)}>{mine.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
        ) : null}
      </header>
      <div className="mk-filters">
        <div className="mk-chips" role="group" aria-label="Sport">
          <button type="button" aria-pressed={sport === "all"} onClick={() => setSport("all")}>All</button>
          {present.map((s) => <button key={s} type="button" aria-pressed={sport === s} onClick={() => setSport(s)}>{SPORT_LABEL[s] ?? s.toUpperCase()}</button>)}
        </div>
        <div className="mk-seg" role="group" aria-label="Status">
          <button type="button" aria-pressed={shownView === "live"} onClick={() => setView("live")}>Live now{liveCount ? <b className="numeric">{liveCount}</b> : null}</button>
          <button type="button" aria-pressed={shownView === "upcoming"} onClick={() => setView("upcoming")}>Upcoming</button>
        </div>
        <div className="mk-seg" role="group" aria-label="Group games">
          <button type="button" aria-pressed={group === "league"} onClick={() => setGroup("league")}>By league</button>
          <button type="button" aria-pressed={group === "time"} onClick={() => setGroup("time")}>By time</button>
        </div>
      </div>
      {!league && !leagues.loading && !sample ? (
        <p className="mk-note" role="note">You can browse every game here. <Link href="/fantasy">Join or start a sports league</Link> to make picks.</p>
      ) : null}
      {failed ? <p className="mk-note" role="status">Some scores are unavailable. This list may be incomplete.</p> : null}
      {(() => {
        const card = (g: ScoreGame) => {
          const tracked = detail.data?.liveEvents?.find((t) => scoreboardMatch(t, [g]))
          const market = detail.data?.markets.find((m) => m.kind === "moneyline" && scoreboardMatch(m.event, [g]))
          return <MarketCard key={`${g.sport}:${g.id}`} g={g} tracked={tracked} split={market ? impliedSplit(market.lines) : null} href={base ? `${base}?game=${encodeURIComponent(`${g.sport}:${g.id}`)}` : null} now={now} />
        }
        if (!shown.length) return <p className="mk-empty" role="status">{scores.loading && !games.length ? "Loading games…" : shownView === "live" ? "No games live right now." : "No upcoming games here."}</p>
        if (group === "time") return <div className="mk-grid" data-v="d">{shown.map(card)}</div>
        // By league: one section per league, in the league's own order, each with its mark, a count and a rule that carries its colour.
        return (
          <div className="mk-sections">
            {present.filter((s) => shown.some((g) => g.sport === s)).map((s) => {
              const list = shown.filter((g) => g.sport === s)
              return (
                <section key={s} className="mk-sec" data-sport={s} aria-labelledby={`mk-sec-${s}`}>
                  <header className="mk-sec-head">
                    <h2 id={`mk-sec-${s}`}><LeagueBrand sport={s} /></h2>
                    <span className="mk-sec-count numeric">{list.length} {shownView === "live" ? "live" : list.length === 1 ? "game" : "games"}</span>
                    <i className="mk-sec-rule" aria-hidden />
                  </header>
                  <div className="mk-grid" data-v="d" data-grouped>{list.map(card)}</div>
                </section>
              )
            })}
          </div>
        )
      })()}
    </section>
  )
}
