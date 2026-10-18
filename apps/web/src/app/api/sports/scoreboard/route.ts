import { NextResponse, after } from 'next/server'
import { ApiError } from '@web/lib/api'
import { db, withSportsPublic } from '@web/lib/sports/api'
import { triggerFromScoreboard } from '@web/lib/sports/settle-now'
import { eventTriggersEnabled } from '@web/lib/sports/settle-trigger'
import { isSportEnabled } from '@web/lib/sports/enabled'
import { SCOREBOARD_PATHS, normalizeGames, scoreboardDays, type ScoreGame } from '@web/lib/sports/scoreboard'
import { espnGroupsQuery } from '@web/lib/sports/types'

/** Public view data only. Next's shared fetch cache bounds free upstream requests across viewers. */
export const GET = withSportsPublic(async (request) => {
  const liveOnly = new URL(request.url).searchParams.get('live') === '1'
  const asked = [...new Set((new URL(request.url).searchParams.get('sports') ?? '').split(','))]
  if (!asked.length || asked.some(s => !Object.hasOwn(SCOREBOARD_PATHS, s))) throw new ApiError('Unknown sport', 400)
  // Paused sports (SPORTS_DISABLED) are dropped, not rejected: an old client may still ask for them. No upstream call is made for them.
  const sports = asked.filter(s => isSportEnabled(s))
  const now = new Date()
  // The fast lane reads only yesterday/today (overnight games), never the upcoming schedule.
  const days = scoreboardDays(now, liveOnly ? 0 : 3)
  const failed = new Set<string>()
  const batches = await Promise.all(sports.flatMap(sport => SCOREBOARD_PATHS[sport]!.flatMap(path => (sport === 'tennis' ? days.slice(1, 2) : days).map(async (day, i) => {
    try {
      const extra = sport === 'cfb' ? '&groups=80' : espnGroupsQuery(sport)
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}&limit=300${extra}`, { next: { revalidate: liveOnly ? 10 : i <= 2 ? 30 : 900 }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error('Scoreboard unavailable')
      const at = res.headers.get('date')
      const fetchedAt = at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString()
      return normalizeGames(await res.json(), sport, fetchedAt)
    } catch { failed.add(sport); return [] }
  }))))
  const games = [...new Map(batches.flat().map((g: ScoreGame) => [`${g.sport}:${g.id}`, g])).values()].sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  // Viewer traffic drives detection: a game ESPN shows as final that we still hold open markets on gets an immediate targeted settle
  // poll, after the response is sent. The poll is deduped and capped per event in the database, so many open clients add no provider calls.
  const finals = games.filter(g => g.status === 'final').map(g => ({ id: g.id, sport: g.sport, home: g.home, away: g.away, startsAt: g.startsAt }))
  if (finals.length && eventTriggersEnabled()) after(() => triggerFromScoreboard(db, finals).then(() => undefined, () => undefined))
  return NextResponse.json({ games, failedSports: [...failed] }, { headers: { 'Cache-Control': 'private, no-store' } })
})
