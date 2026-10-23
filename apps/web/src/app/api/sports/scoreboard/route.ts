import { NextResponse, after } from 'next/server'
import { ApiError } from '@web/lib/api'
import { db, withSportsPublic } from '@web/lib/sports/api'
import { triggerFromScoreboard } from '@web/lib/sports/settle-now'
import { eventTriggersEnabled } from '@web/lib/sports/settle-trigger'
import { isSportEnabled } from '@web/lib/sports/enabled'
import { SCOREBOARD_PATHS, normalizeGames, scoreboardDays, type ScoreGame } from '@web/lib/sports/scoreboard'
import { espnGroupsQuery } from '@web/lib/sports/types'

type Scoreboard = { games: ScoreGame[]; failedSports: string[] }

/**
 * Normalized games per ESPN scoreboard URL (one sport, one day), kept per server instance for as long as that
 * URL's fetch is fresh. Every open sports page polls this route (10s live, 30s otherwise), and re-reading and
 * re-parsing each sport-day's ESPN JSON on every poll was the costliest route in function CPU. Within the window
 * the fetch cache would hand back the same body, so the games are the same; the live lane's 10s reads also serve
 * the 30s lane's today and yesterday, and the far days are parsed once per 15 minutes. Concurrent polls share one
 * read; a failed read is not kept.
 */
const parsed = new Map<string, { at: number; games: Promise<ScoreGame[]> }>()
const KEEP_MS = 900_000

function sportDay(url: string, sport: string, maxAgeSeconds: number): Promise<ScoreGame[]> {
  const now = Date.now()
  const hit = parsed.get(url)
  if (hit && now - hit.at < maxAgeSeconds * 1000) return hit.games
  for (const [k, v] of parsed) if (now - v.at >= KEEP_MS) parsed.delete(k)
  const games = (async () => {
    // This map is the cache. Next's fetch cache on top only cost CPU: storing, revalidating and decoding megabytes of ESPN JSON per poll.
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error('Scoreboard unavailable')
    const at = res.headers.get('date')
    const fetchedAt = at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString()
    return normalizeGames(await res.json(), sport, fetchedAt)
  })()
  parsed.set(url, { at: now, games })
  games.catch(() => { if (parsed.get(url)?.games === games) parsed.delete(url) })
  return games
}

async function buildScoreboard(sports: string[], liveOnly: boolean): Promise<Scoreboard> {
  // The fast lane reads only yesterday/today (overnight games), never the upcoming schedule.
  const days = scoreboardDays(new Date(), liveOnly ? 0 : 3)
  const failed = new Set<string>()
  const batches = await Promise.all(sports.flatMap(sport => SCOREBOARD_PATHS[sport]!.flatMap(path => (sport === 'tennis' ? days.slice(1, 2) : days).map(async (day, i) => {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}&limit=300${espnGroupsQuery(sport)}`
      return await sportDay(url, sport, liveOnly ? 10 : i <= 2 ? 30 : 900)
    } catch { failed.add(sport); return [] }
  }))))
  const games = [...new Map(batches.flat().map((g: ScoreGame) => [`${g.sport}:${g.id}`, g])).values()].sort((a,b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  return { games, failedSports: [...failed] }
}

/** Public view data only. The per-URL cache above bounds free upstream requests across viewers: one ESPN read per URL per window per instance. */
export const GET = withSportsPublic(async (request) => {
  const liveOnly = new URL(request.url).searchParams.get('live') === '1'
  const asked = [...new Set((new URL(request.url).searchParams.get('sports') ?? '').split(','))]
  if (!asked.length || asked.some(s => !Object.hasOwn(SCOREBOARD_PATHS, s))) throw new ApiError('Unknown sport', 400)
  // Paused sports (SPORTS_DISABLED) are dropped, not rejected: an old client may still ask for them. No upstream call is made for them.
  const sports = asked.filter(s => isSportEnabled(s))
  const { games, failedSports } = await buildScoreboard(sports, liveOnly)
  // Viewer traffic drives detection: a game ESPN shows as final that we still hold open markets on gets an immediate targeted settle
  // poll, after the response is sent. The poll is deduped and capped per event in the database, so many open clients add no provider calls.
  const finals = games.filter(g => g.status === 'final').map(g => ({ id: g.id, sport: g.sport, home: g.home, away: g.away, startsAt: g.startsAt }))
  if (finals.length && eventTriggersEnabled()) after(() => triggerFromScoreboard(db, finals).then(() => undefined, () => undefined))
  return NextResponse.json({ games, failedSports }, { headers: { 'Cache-Control': 'private, no-store' } })
})
