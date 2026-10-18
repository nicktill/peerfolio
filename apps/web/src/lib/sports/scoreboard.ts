/** Free, view-only schedule metadata. Independent of exchange markets and picks. */
export const SCOREBOARD_PATHS: Record<string, string[]> = {
  nfl: ['football/nfl'], nba: ['basketball/nba'], nhl: ['hockey/nhl'], mlb: ['baseball/mlb'],
  cfb: ['football/college-football'], mls: ['soccer/usa.1'], tennis: ['tennis/atp', 'tennis/wta'],
}
export type ScoreGame = {
  id: string; sport: string; home: string; away: string; startsAt: string
  homeRecord: string | null; awayRecord: string | null
  status: 'upcoming' | 'live' | 'final' | 'unavailable'
  homeScore: string | null; awayScore: string | null; detail: string; fetchedAt: string
  /** VIEW ONLY. Vig-free moneyline win chance derived from ESPN's in-game odds (0-1). Never used for picks, settlement or tests. */
  homeWinProb?: number; awayWinProb?: number; drawProb?: number; probSource?: 'espn'
}
type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => v && typeof v === 'object' ? v as Obj : {}
const list = (v: unknown): Obj[] => Array.isArray(v) ? v.map(obj) : []
const str = (v: unknown) => typeof v === 'string' ? v : ''
const record = (c: Obj) => {
  const records = list(c.records)
  const overall = records.find(r => r.type === 'total' || r.name === 'overall' || r.name === 'All Splits')
  const summary = str(overall?.summary)
  return /^\d+(?:[-–]\d+){1,2}$/.test(summary) ? summary : null
}
const american = (v: unknown): number | null => {
  const t = (typeof v === 'number' ? String(v) : str(v)).trim().toUpperCase()
  if (t === 'EVEN') return 100
  if (!/^[+-]?\d+$/.test(t)) return null
  const n = Number(t)
  return Math.abs(n) >= 100 && Math.abs(n) <= 100_000 ? n : null
}
const implied = (a: number) => a < 0 ? -a / (-a + 100) : 100 / (a + 100)
/** In-game ESPN moneyline (`current` only; `open`/`close` are pre-game and stale once play starts), vig removed. Null unless sane. */
export function liveWinProbs(competition: Obj, threeWay: boolean): { home: number; away: number; draw?: number } | null {
  for (const o of list(competition.odds)) {
    const ml = obj(o.moneyline)
    const price = (side: unknown) => american(obj(obj(side).current).odds)
    const h = price(ml.home), a = price(ml.away), d = threeWay ? price(ml.draw) : null
    if (h == null || a == null || (threeWay && d == null)) continue
    const ps = [implied(h), implied(a), ...(d != null ? [implied(d)] : [])]
    const total = ps.reduce((x, y) => x + y, 0)
    // A real book sums to roughly 1.02-1.15; anything else is a bad or half-updated quote.
    if (total < 1 || total > 1.3) continue
    const [ph, pa, pd] = ps.map(p => p / total) as [number, number, number | undefined]
    return pd != null ? { home: ph, away: pa, draw: pd } : { home: ph, away: pa }
  }
  return null
}
export function normalizeGames(raw: unknown, sport: string, fetchedAt: string): ScoreGame[] {
  const result: ScoreGame[] = []
  for (const e of list(obj(raw).events)) {
    const competitions = sport === 'tennis' ? list(e.groupings).flatMap(g => list(g.competitions)) : list(e.competitions)
    for (const c of competitions) {
      const competitors = list(c.competitors)
      const ordered = [...competitors].sort((a,b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      const home = sport === 'tennis' ? ordered[0] : competitors.find(x => x.homeAway === 'home')
      const away = sport === 'tennis' ? ordered[1] : competitors.find(x => x.homeAway === 'away')
      if (!home || !away) continue
      const name = (x: Obj) => str(obj(x.team).displayName) || str(obj(x.athlete).displayName)
      const startsAt = str(c.date) || str(e.date)
      if (!name(home) || !name(away) || !Number.isFinite(Date.parse(startsAt))) continue
      const status = obj(c.status ?? e.status), type = obj(status.type)
      const state = str(type.state), special = str(type.name)
      const unavailable = /POSTPONED|CANCEL/.test(special) || (/SUSPEND|DELAY|RAIN/.test(special) && state !== 'in')
      const live = !unavailable && state === 'in'
      const final = type.completed === true || state === 'post'
      const score = (x: Obj) => {
        if (sport === 'tennis') {
          const other = x === home ? away : home
          const lines = list(x.linescores), opposing = list(other.linescores)
          if (lines.length) return String(lines.reduce((n,l,i) => {
            const a = Number(l.value), b = Number(opposing[i]?.value)
            return n + (a >= 6 && (a-b >= 2 || a === 7 && b === 6) ? 1 : 0)
          },0))
        }
        const v = x.score
        return (live || final) && (typeof v === 'string' || typeof v === 'number') && /^\d+$/.test(String(v)) ? String(v) : null
      }
      const probs = live && sport !== 'tennis' ? liveWinProbs(c, sport === 'mls') : null
      result.push({ id: str(c.id) || str(e.id), sport, home: name(home), away: name(away), startsAt,
        homeRecord: record(home), awayRecord: record(away), status: unavailable ? 'unavailable' : final ? 'final' : live ? 'live' : 'upcoming',
        homeScore: score(home), awayScore: score(away), detail: str(type.shortDetail) || str(type.detail) || str(status.displayClock), fetchedAt,
        ...(probs ? { homeWinProb: probs.home, awayWinProb: probs.away, ...(probs.draw != null ? { drawProb: probs.draw } : {}), probSource: 'espn' as const } : {}) })
    }
  }
  return result
}
/** ESPN dates scoreboards in US Eastern time, including games after midnight UTC. ESPN rejects date ranges, so each day is its own request. */
export function scoreboardDays(now: Date, ahead = 1): string[] {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replaceAll('-', '')
  // Previous day catches games still running past midnight; later days supply upcoming games and records.
  return [...new Set(Array.from({ length: ahead + 2 }, (_, i) => i - 1).map(n => day(new Date(now.getTime() + n * 86_400_000))))]
}
const canonical = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
export function scoreboardMatch(event: {sport: string; home: string; away: string; startsAt: string}, games: ScoreGame[]): ScoreGame | undefined {
  return games.find(g => g.sport === event.sport && canonical(g.home) === canonical(event.home) && canonical(g.away) === canonical(event.away) && Math.abs(Date.parse(g.startsAt) - Date.parse(event.startsAt)) < 20 * 60_000)
}
