import type { ScoreGame } from './scoreboard.ts'

const RANK: Record<string, number> = { nfl: 0, nba: 1, nhl: 2, mlb: 3, mls: 4, epl: 4, laliga: 4, ucl: 4, cfb: 5, wnba: 5, ncaab: 5, tennis: 9 }
const rank = (sport: string) => RANK[sport] ?? 6
const bucket = (g: ScoreGame) => g.status === 'live' ? 0 : 1

/** Hero bubble candidates: live first, then final/upcoming; popular leagues first, tennis last. Real games only. */
export function pickHeroGames(games: ScoreGame[], now: number, limit = 3): ScoreGame[] {
  const t = (g: ScoreGame) => Date.parse(g.startsAt)
  const pool = games.filter(g => g.status === 'live' || g.status === 'final' || (g.status === 'upcoming' && t(g) > now))
  const key = (g: ScoreGame) => g.sport === 'tennis' ? 1 : 0
  return pool.sort((a, b) =>
    key(a) - key(b) || bucket(a) - bucket(b) || rank(a.sport) - rank(b.sport) ||
    (a.status === 'final' && b.status === 'final' ? t(b) - t(a) : t(a) - t(b))
  ).slice(0, limit)
}
