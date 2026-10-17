import { NextResponse } from 'next/server'
import { ApiError } from '@web/lib/api'
import { withSportsPublic } from '@web/lib/sports/api'
import { SCOREBOARD_PATHS, normalizeGames, scoreboardDays, type ScoreGame } from '@web/lib/sports/scoreboard'

/** Public view data only. Next's shared fetch cache bounds free upstream requests across viewers. */
export const GET = withSportsPublic(async (request) => {
  const sports = [...new Set((new URL(request.url).searchParams.get('sports') ?? '').split(','))]
  if (!sports.length || sports.some(s => !Object.hasOwn(SCOREBOARD_PATHS, s))) throw new ApiError('Unknown sport', 400)
  const days = scoreboardDays(new Date())
  const failed = new Set<string>()
  const batches = await Promise.all(sports.flatMap(sport => SCOREBOARD_PATHS[sport]!.flatMap(path => (sport === 'tennis' ? days.slice(1, 2) : days).map(async day => {
    try {
      const extra = sport === 'cfb' ? '&groups=80' : ''
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}&limit=300${extra}`, { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error('Scoreboard unavailable')
      const at = res.headers.get('date')
      const fetchedAt = at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString()
      return normalizeGames(await res.json(), sport, fetchedAt)
    } catch { failed.add(sport); return [] }
  }))))
  const games = [...new Map(batches.flat().map((g: ScoreGame) => [`${g.sport}:${g.id}`, g])).values()].sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  return NextResponse.json({ games, failedSports: [...failed] }, { headers: { 'Cache-Control': 'private, no-store' } })
})
