"use client"

import { Lock } from 'lucide-react'
import { LeagueBrand } from './league-brand'
import { TeamBadge } from './team-badge'
import { useLiveGame } from './live-game'
import { chipFor, splitPct, splitPct3 } from '@web/lib/sports/live/format'
import { AdminLiveTestPanel } from './admin-live-test'
import { LivePickPanel } from './live-pick-panel'
import { type ScoreGame, type TennisSet, scoreboardMatch } from '@web/lib/sports/scoreboard'
import { OddsTrend } from './odds-trend'
import { matchupColors } from '@web/lib/sports/matchup-colors'

export type LivePickConfig = { leagueId: string; liveBetting: boolean; credits: number; startingCredits: number; maxStakePct: number; onPlaced: () => void }
type Tracked = {id: string; sport: string; home: string; away: string; startsAt: string}
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const UPCOMING_LIMIT = 12

const sides = (g: ScoreGame) => [{ name: g.away, record: g.awayRecord, score: g.awayScore, sets: g.awaySets }, { name: g.home, record: g.homeRecord, score: g.homeScore, sets: g.homeSets }]
/** Per-set tennis games; the set in play is highlighted. Sets-won stays the big number. */
function SetScores({ sets, live }: { sets?: TennisSet[]; live: boolean }) {
  if (!sets?.length) return null
  return <span className="sp-sets">{sets.map((s, i) => <span key={i} className="sp-set" data-current={live && i === sets.length - 1 || undefined} style={live && i === sets.length - 1 ? { color: 'var(--fw-fg1)', fontWeight: 700 } : undefined}>{s.games}{s.tiebreak != null ? <sup>{s.tiebreak}</sup> : null}</span>)}</span>
}
function CardHead({ g, chip }: { g: ScoreGame; chip: React.ReactNode }) {
  return <div className="sp-game-head"><div className="sp-matchup"><strong>{g.away} {g.sport === "tennis" ? "vs" : "@"} {g.home}</strong></div><span className="sp-game-meta"><LeagueBrand sport={g.sport} />{chip}</span></div>
}
function TeamRows({ g, showScore, trendId }: { g: ScoreGame; showScore: boolean; trendId?: string }) {
  const colors = matchupColors(g.sport, g.away, g.home)
  return <div className="sp-lines sp-team-lines">
    {sides(g).map((side, i) => <div key={side.name} className="sp-line sp-live-side" data-team data-accent={colors[i]} style={{ '--tc': colors[i] } as React.CSSProperties}>{trendId ? <OddsTrend eventId={trendId} side={i === 0 ? 'away' : 'home'} color={colors[i]} /> : null}<TeamBadge sport={g.sport} name={side.name} size={40} /><span className="sp-line-name">{side.name}{side.record ? <small className="sp-team-record"> ({side.record})</small> : null}</span>{showScore ? <SetScores sets={side.sets} live={g.status === 'live'} /> : null}{showScore ? <b className="sp-live-score">{side.score ?? '–'}</b> : null}</div>)}
  </div>
}
type Split = { home: number; away: number; draw: number | null }
function LiveCard({ g, now, tracked, enableAdminTest, livePick }: { g: ScoreGame; now: number; tracked?: Tracked; enableAdminTest: boolean; livePick?: LivePickConfig }) {
  const fresh = now - Date.parse(g.fetchedAt) < 120_000
  const { view, elapsedMs } = useLiveGame(tracked?.id, fresh)
  const chip = chipFor(view, elapsedMs)
  const colors = matchupColors(g.sport, g.away, g.home)
  // The exchange view is more accurate, so it wins; ESPN's in-game moneyline is only an estimate and only fills the gap.
  const ex = view?.odds.status === 'ok' && chip.tone !== 'paused' ? view.odds : null
  const exchange: Split | null = ex ? (ex.drawProb != null ? splitPct3(ex.homeProb, ex.drawProb) : { ...splitPct(ex.homeProb), draw: null }) : null
  const est: Split | null = !exchange && fresh && g.probSource === 'espn' && g.homeWinProb != null && g.awayWinProb != null
    ? (g.drawProb != null ? splitPct3(g.homeWinProb, g.drawProb) : { ...splitPct(g.homeWinProb), draw: null }) : null
  const split = exchange ?? est
  return <article className="sp-game sp-live-card">
    <CardHead g={g} chip={<span className="sp-feed-chip" data-live={fresh || undefined}><i />{fresh ? 'In progress' : 'Scores delayed'}</span>} />
    {split ? <div className="sp-odds-bar" role="img" aria-label={`Win probability: ${g.away} ${split.away} percent, ${split.draw != null ? `draw ${split.draw} percent, ` : ''}${g.home} ${split.home} percent`}>
      <div className="sp-odds-track">
        <i style={{ width: `${split.away}%`, background: colors[0] }} />
        {split.draw != null ? <i style={{ width: `${split.draw}%`, background: 'var(--fw-fg3)' }} /> : null}
        <i style={{ flex: 1, background: colors[1] }} />
      </div>
      <div className="sp-odds-labels">
        <span>{split.away}% <small>{g.away}</small></span>
        {split.draw != null ? <span>{split.draw}% <small>Draw</small></span> : null}
        <span><small>{g.home}</small> {split.home}%</span>
      </div>
    </div> : null}
    <TeamRows g={g} showScore trendId={fresh ? tracked?.id : undefined} />
    <div className="sp-live-footer"><span>{fresh ? g.detail : 'Last reported score · updates delayed'}</span><span><Lock aria-hidden />Picks locked</span></div>
    <p className="sp-fine">{exchange ? 'Market-implied chance · view only' : est ? 'Est. from ESPN odds · view only' : 'View only · live win probabilities unavailable'}</p>
    {livePick?.liveBetting ? (tracked && fresh
      ? <LivePickPanel leagueId={livePick.leagueId} eventId={tracked.id} home={g.home} away={g.away} sport={g.sport} credits={livePick.credits} startingCredits={livePick.startingCredits} maxStakePct={livePick.maxStakePct} onPlaced={livePick.onPlaced} />
      : <p className="sp-fine">Live picks are not available for this game right now.</p>) : null}
    {tracked && enableAdminTest && !livePick?.liveBetting ? <AdminLiveTestPanel eventId={tracked.id} home={g.home} away={g.away} /> : null}
  </article>
}

export function ScoreboardGames({ games, tracked, now, loading, failed, enableAdminTest = false, livePick }: { games: ScoreGame[]; tracked: Tracked[]; now: number; loading: boolean; failed: boolean; enableAdminTest?: boolean; livePick?: LivePickConfig }) {
  const live = games.filter(g => g.status === 'live')
  // Quiet right now: show what is coming up in the next few days instead of an empty panel.
  const upcoming = games.filter(g => g.status === 'upcoming' && Date.parse(g.startsAt) > now).slice(0, UPCOMING_LIMIT)
  if (loading && !games.length) return <p className="fw-empty" role="status">Loading live games…</p>
  if (!live.length && !upcoming.length) return <p className="fw-empty" role="status">{failed ? 'Live scores are temporarily unavailable. Please try again shortly.' : 'No games scheduled in the next few days for this sport.'}</p>
  const card = (g: ScoreGame, isLive: boolean) => isLive
    ? <LiveCard key={`${g.sport}:${g.id}`} g={g} now={now} tracked={tracked.find(t => scoreboardMatch(t, [g]))} enableAdminTest={enableAdminTest} livePick={livePick} />
    : <article key={`${g.sport}:${g.id}`} className="sp-game sp-live-card">
      <CardHead g={g} chip={<span>{when(g.startsAt)}</span>} />
      <TeamRows g={g} showScore={false} />
    </article>
  return <div className="sp-live-games">
    {failed ? <p className="sp-fine" role="status">Some scores are unavailable. This list may be incomplete.</p> : null}
    {live.length ? live.map(g => card(g, true)) : <p className="fw-empty" role="status">Nothing in progress right now.</p>}
    {upcoming.length ? <><h3 className="sp-day">Coming up</h3>{upcoming.map(g => card(g, false))}</> : null}
  </div>
}
