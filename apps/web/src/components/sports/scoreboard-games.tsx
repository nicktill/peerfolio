"use client"

import { Lock } from 'lucide-react'
import { LeagueBrand } from './league-brand'
import { TeamBadge } from './team-badge'
import { useLiveGame } from './live-game'
import { chipFor, splitPct, splitPct3 } from '@web/lib/sports/live/format'
import { AdminLiveTestPanel } from './admin-live-test'
import { type LivePickSelection } from './live-pick-panel'
import { type ScoreGame, type TennisSet, scoreboardMatch } from '@web/lib/sports/scoreboard'
import { LiveNumber } from './live-delta'
import { OddsTrend } from './odds-trend'
import { GameStatusChip, statusInputFromGame } from './game-status-chip'
import { mergeLiveState } from '@web/lib/sports/game-status'
import { matchupColors } from '@web/lib/sports/matchup-colors'
import { testOffer, type TestOffer } from '@web/lib/sports/live-test'
import { ageView } from '@web/lib/sports/live/view'
import type { LiveSelection } from '@web/lib/sports/live/types'
import { formatOdds, winOn100 } from '@web/lib/sports/format'
import { oddsLabel } from '@web/lib/sports/teams'

export type LivePickConfig = { selected?: LivePickSelection | null; busy?: boolean; onSelect: (selection: LivePickSelection) => void; mode?: "single" | "parlay"; leagueId: string; liveBetting: boolean; credits: number; startingCredits: number; maxStakePct: number; onPlaced: () => void }
type Tracked = {id: string; sport: string; home: string; away: string; startsAt: string}
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
const UPCOMING_LIMIT = 12

const pctText = (n: number) => `${n}%`
const scoreText = (n: number) => String(n)
const sides = (g: ScoreGame) => [{ name: g.away, record: g.awayRecord, score: g.awayScore, sets: g.awaySets }, { name: g.home, record: g.homeRecord, score: g.homeScore, sets: g.homeSets }]
/** Per-set tennis games; the set in play is highlighted. Sets-won stays the big number. */
function SetScores({ sets, live }: { sets?: TennisSet[]; live: boolean }) {
  if (!sets?.length) return null
  return <span className="sp-sets">{sets.map((s, i) => <span key={i} className="sp-set" data-current={live && i === sets.length - 1 || undefined} style={live && i === sets.length - 1 ? { color: 'var(--fw-fg1)', fontWeight: 700 } : undefined}>{s.games}{s.tiebreak != null ? <sup>{s.tiebreak}</sup> : null}</span>)}</span>
}
function CardHead({ g, chip }: { g: ScoreGame; chip: React.ReactNode }) {
  return <div className="sp-game-head"><div className="sp-matchup"><strong>{g.away} {g.sport === "tennis" ? "vs" : "@"} {g.home}</strong></div><span className="sp-game-meta"><LeagueBrand sport={g.sport} />{chip}</span></div>
}
function TeamRows({ g, showScore, trendId, offer, livePick, eventId }: { g: ScoreGame; showScore: boolean; trendId?: string; offer?: TestOffer | null; livePick?: LivePickConfig; eventId?: string }) {
  const colors = matchupColors(g.sport, g.away, g.home)
  return <div className="sp-lines sp-team-lines">
    {sides(g).map((side, i) => {
      const selection: LiveSelection = i === 0 ? 'away' : 'home'
      const price = offer?.prices[selection]
      const canPick = !!eventId && !!livePick && price != null
      const Row = canPick ? 'button' : 'div'
      return <Row key={selection} type={canPick ? 'button' : undefined} className="sp-line sp-live-side" data-team data-accent={colors[i]} style={{ '--tc': colors[i] } as React.CSSProperties} aria-label={canPick ? `Live pick ${side.name}, ${formatOdds(price!)}` : undefined} aria-pressed={canPick ? livePick?.selected?.eventId === eventId && livePick?.selected?.side === selection : undefined} disabled={canPick ? livePick?.busy : undefined} onClick={canPick ? () => livePick!.onSelect({ eventId: eventId!, home: g.home, away: g.away, sport: g.sport, side: selection, price: price! }) : undefined}>
        <TeamBadge sport={g.sport} name={side.name} size={40} /><span className="sp-line-name">{side.name}{side.record ? <small className="sp-team-record"> ({side.record})</small> : null}</span>
        {trendId ? <OddsTrend eventId={trendId} side={selection} color={colors[i]} /> : null}
        {showScore ? <SetScores sets={side.sets} live={g.status === 'live'} /> : null}
        {showScore ? <b className="sp-live-score"><LiveNumber value={side.score == null ? null : Number.isFinite(Number(side.score)) ? Number(side.score) : null} format={scoreText} kind="score" seenKey={`score:${g.sport}:${g.id}:${side.name}`} /></b> : null}
        {canPick ? <span className="sp-line-odds"><b>{formatOdds(price!)}</b><small>$100 wins ${winOn100(price!)}</small></span> : null}
      </Row>
    })}
  </div>
}

type Split = { home: number; away: number; draw: number | null }
function LiveCard({ g, now, tracked, enableAdminTest, livePick }: { g: ScoreGame; now: number; tracked?: Tracked; enableAdminTest: boolean; livePick?: LivePickConfig }) {
  const fresh = now - Date.parse(g.fetchedAt) < 120_000
  const { view, elapsedMs } = useLiveGame(tracked?.id, fresh)
  const chip = chipFor(view, elapsedMs)
  const colors = matchupColors(g.sport, g.away, g.home)
  const statusInput = mergeLiveState(statusInputFromGame(g), view)
  const asOfMs = typeof statusInput.asOf === 'number' ? statusInput.asOf : Date.parse(statusInput.asOf)
  const updated = Math.max(0, Math.round((now - asOfMs) / 1000))
  // The exchange view is more accurate, so it wins; ESPN's in-game moneyline is only an estimate and only fills the gap.
  const ex = view?.odds.status === 'ok' && chip.tone !== 'paused' ? view.odds : null
  const exchange: Split | null = ex ? (ex.drawProb != null ? splitPct3(ex.homeProb, ex.drawProb) : { ...splitPct(ex.homeProb), draw: null }) : null
  const est: Split | null = !exchange && fresh && g.probSource === 'espn' && g.homeWinProb != null && g.awayWinProb != null
    ? (g.drawProb != null ? splitPct3(g.homeWinProb, g.drawProb) : { ...splitPct(g.homeWinProb), draw: null }) : null
  const split = exchange ?? est
  let offer: TestOffer | null = null
  try { if (view && fresh) { const aged = ageView(view, elapsedMs); offer = testOffer(aged, Date.parse(aged.serverTime)) } } catch { /* stale quotes never become selectable lines */ }
  const selectable = !!tracked && !!livePick?.liveBetting && livePick.mode !== 'parlay'

  return <article className="sp-game sp-live-card" data-matchup style={{ '--away-color': colors[0], '--home-color': colors[1] } as React.CSSProperties}>
    <CardHead g={g} chip={<GameStatusChip input={statusInput} now={now} />} />
    {split ? <div className="sp-odds-bar" role="img" aria-label={`Win probability: ${g.away} ${split.away} percent, ${split.draw != null ? `draw ${split.draw} percent, ` : ''}${g.home} ${split.home} percent`}>
      <div className="sp-odds-track">
        <i style={{ width: `${split.away}%`, background: colors[0] }} />
        {split.draw != null ? <i style={{ width: `${split.draw}%`, background: 'var(--fw-fg3)' }} /> : null}
        <i style={{ flex: 1, background: colors[1] }} />
      </div>
      <div className="sp-odds-labels">
        <span><LiveNumber value={split.away} format={pctText} kind="pct" /> <small>{oddsLabel(g.sport, g.away)}</small></span>
        {split.draw != null ? <span><LiveNumber value={split.draw} format={pctText} kind="pct" /> <small>Draw</small></span> : null}
        <span><small>{oddsLabel(g.sport, g.home)}</small> <LiveNumber value={split.home} format={pctText} kind="pct" /></span>
      </div>
    </div> : null}
    <TeamRows g={g} showScore trendId={fresh ? tracked?.id : undefined} offer={selectable ? offer : null} livePick={selectable ? livePick : undefined} eventId={tracked?.id} />
    {selectable && offer?.prices.draw != null ? <button type="button" className="sp-line sp-live-draw" aria-label={`Live pick Draw, ${formatOdds(offer.prices.draw)}`} aria-pressed={livePick?.selected?.eventId === tracked!.id && livePick.selected.side === 'draw'} disabled={livePick?.busy} onClick={() => livePick!.onSelect({ eventId: tracked!.id, home: g.home, away: g.away, sport: g.sport, side: 'draw', price: offer!.prices.draw! })}><span>Draw</span><b>{formatOdds(offer.prices.draw)}</b></button> : null}
    <div className="sp-live-footer"><span>{fresh ? (updated < 30 ? 'Updated just now' : `Updated ${updated}s ago`) : 'Last reported score · updates delayed'}</span><span><Lock aria-hidden />Pregame picks locked</span></div>
    {tracked && enableAdminTest && !livePick?.liveBetting ? <AdminLiveTestPanel eventId={tracked.id} home={g.home} away={g.away} /> : null}
  </article>
}

export function ScoreboardGames({ games, tracked, now, loading, failed, enableAdminTest = false, livePick, query, onShowUpcoming, renderUpcoming }: { query?: string; onShowUpcoming?: () => void; renderUpcoming?: (game: ScoreGame) => React.ReactNode; games: ScoreGame[]; tracked: Tracked[]; now: number; loading: boolean; failed: boolean; enableAdminTest?: boolean; livePick?: LivePickConfig }) {
  const live = games.filter(g => g.status === 'live')
  // Quiet right now: show what is coming up in the next few days instead of an empty panel.
  const upcoming = games.filter(g => g.status === 'upcoming' && Date.parse(g.startsAt) > now).slice(0, UPCOMING_LIMIT)
  if (loading && !games.length) return <p className="fw-empty" role="status">Loading live games…</p>
  if (!live.length && !upcoming.length && query) return <p className="fw-empty" role="status">No games match &ldquo;{query}&rdquo;</p>
  if (!live.length && !upcoming.length) return <p className="fw-empty" role="status">{failed ? 'Live scores are temporarily unavailable. Please try again shortly.' : 'No games scheduled in the next few days for this sport.'}</p>
  const card = (g: ScoreGame, isLive: boolean) => isLive
    ? <LiveCard key={`${g.sport}:${g.id}`} g={g} now={now} tracked={tracked.find(t => scoreboardMatch(t, [g]))} enableAdminTest={enableAdminTest} livePick={livePick} />
    : <div key={`${g.sport}:${g.id}`}>{renderUpcoming?.(g) ?? <article className="sp-game sp-live-card">
      <CardHead g={g} chip={<span>{when(g.startsAt)}</span>} />
      <TeamRows g={g} showScore={false} />
      <p className="sp-fine">Pregame lines are not available for this game yet.</p>
    </article>}</div>
  return <div className="sp-live-games">
    {livePick ? <p className="sp-fine sp-live-hint" role="note">{livePick.liveBetting ? "Live picks are on: games in progress with a live price can be picked below, at the price you see." : "Live picks are off in this league. You can still follow games here."}</p> : null}
    {failed ? <p className="sp-fine" role="status">Some scores are unavailable. This list may be incomplete.</p> : null}
    {live.length ? live.map(g => card(g, true)) : <p className="fw-empty" role="status">Nothing in progress right now.</p>}
    {upcoming.length ? <><h3 className="sp-day">Coming up</h3>{onShowUpcoming ? <p className="sp-fine sp-coming-note">{renderUpcoming ? 'Pick an available line below, or browse all games in the ' : 'Pick these games from the '}<button type="button" className="sp-link" onClick={onShowUpcoming}>Upcoming tab</button> before kickoff.</p> : null}{upcoming.map(g => card(g, false))}</> : null}
  </div>
}
