"use client"

import { Lock } from 'lucide-react'
import { LeagueBrand } from './league-brand'
import { TeamBadge } from './team-badge'
import { LiveGameStrip } from './live-game'
import { type ScoreGame, scoreboardMatch } from '@web/lib/sports/scoreboard'
import { matchupColors } from '@web/lib/sports/matchup-colors'

type Tracked = {id: string; sport: string; home: string; away: string; startsAt: string}
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const UPCOMING_LIMIT = 12

export function ScoreboardGames({ games, tracked, now, loading, failed }: { games: ScoreGame[]; tracked: Tracked[]; now: number; loading: boolean; failed: boolean }) {
  const live = games.filter(g => g.status === 'live')
  // Quiet right now: show what is coming up in the next few days instead of an empty panel.
  const upcoming = games.filter(g => g.status === 'upcoming' && Date.parse(g.startsAt) > now).slice(0, UPCOMING_LIMIT)
  if (loading && !games.length) return <p className="fw-empty" role="status">Loading live games…</p>
  if (!live.length && !upcoming.length) return <p className="fw-empty" role="status">{failed ? 'Live scores are temporarily unavailable. Please try again shortly.' : 'No games scheduled in the next few days for this sport.'}</p>
  const card = (g: ScoreGame, isLive: boolean) => {
    const fresh = isLive && now - Date.parse(g.fetchedAt) < 120_000
    const colors = matchupColors(g.sport, g.away, g.home)
    const known = isLive ? tracked.find(t => scoreboardMatch(t, [g])) : undefined
    return <article key={`${g.sport}:${g.id}`} className="sp-game sp-live-card">
      <div className="sp-game-head"><div className="sp-matchup"><strong>{g.away} {g.sport === "tennis" ? "vs" : "@"} {g.home}</strong></div><span className="sp-game-meta"><LeagueBrand sport={g.sport} />{isLive ? <span className="sp-feed-chip" data-live={fresh || undefined}><i />{fresh ? 'In progress' : 'Scores delayed'}</span> : <span>{when(g.startsAt)}</span>}</span></div>
      <div className="sp-lines sp-team-lines">
        {[{ name: g.away, record: g.awayRecord, score: g.awayScore }, { name: g.home, record: g.homeRecord, score: g.homeScore }].map((side, i) => <div key={side.name} className="sp-line sp-live-side" data-team data-accent={colors[i]} style={{ '--tc': colors[i] } as React.CSSProperties}><TeamBadge sport={g.sport} name={side.name} size={40} /><span className="sp-line-name">{side.name}{side.record ? <small className="sp-team-record"> ({side.record})</small> : null}</span>{isLive ? <b className="sp-live-score">{side.score ?? '–'}</b> : null}</div>)}
      </div>
      {isLive ? <>
        <div className="sp-live-footer"><span>{fresh ? g.detail : 'Last reported score · updates delayed'}</span><span><Lock aria-hidden />Picks locked</span></div>
        {known ? <LiveGameStrip eventId={known.id} sport={g.sport} home={g.home} away={g.away} active={fresh} /> : <p className="sp-fine">View only · live win probabilities unavailable</p>}
      </> : null}
    </article>
  }
  return <div className="sp-live-games">
    {failed ? <p className="sp-fine" role="status">Some scores are unavailable. This list may be incomplete.</p> : null}
    {live.length ? live.map(g => card(g, true)) : <p className="fw-empty" role="status">Nothing in progress right now.</p>}
    {upcoming.length ? <><h3 className="sp-day">Coming up</h3>{upcoming.map(g => card(g, false))}</> : null}
  </div>
}
