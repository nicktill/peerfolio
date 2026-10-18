import type { EventRef, EventResult, ResultsProvider, ResultStatus, Sport } from "../types.ts"

/**
 * MLB's own public Stats API (statsapi.mlb.com) as a results source. Keyless and free, and operated by the league, so its
 * family ("mlb-statsapi") is independent of ESPN: two families agreeing on an MLB final is real corroboration.
 * Results only; it never reads or sends a key and imports nothing from the pricing side.
 *
 * One call covers the whole date range (`startDate`/`endDate`), and answers are cached briefly.
 *
 * Trap: a postponed game reports `abstractGameState: "Final"` with `detailedState: "Postponed"`, so the detailed state is
 * read first and "Final" alone is never trusted.
 */

type Side = { team?: { id?: number; name?: string }; score?: number }
type Game = {
  gamePk?: number
  gameDate?: string
  status?: { abstractGameState?: string; detailedState?: string; codedGameState?: string; statusCode?: string }
  teams?: { away?: Side; home?: Side }
}
export type MlbSchedule = { dates?: { date?: string; games?: Game[] }[] }

export function mapMlbStatus(status: Game["status"]): ResultStatus {
  const detailed = (status?.detailedState ?? "").toLowerCase()
  const abstract = (status?.abstractGameState ?? "").toLowerCase()
  if (/postpone/.test(detailed)) return "postponed"
  if (/cancel/.test(detailed)) return "cancelled"
  if (/forfeit/.test(detailed)) return "retired"
  if (/suspend/.test(detailed)) return "in_progress"
  if (/^(final|game over|completed early)/.test(detailed) || (abstract === "final" && detailed === "")) return "final"
  if (abstract === "live" || /in progress|delayed|warmup|manager challenge|review/.test(detailed)) return "in_progress"
  return "scheduled"
}

const score = (s: Side | undefined): number | null => (typeof s?.score === "number" && Number.isFinite(s.score) ? s.score : null)

export function normalizeMlbSchedule(board: MlbSchedule): EventResult[] {
  const out: EventResult[] = []
  const seen = new Set<number>()
  for (const day of board.dates ?? []) {
    for (const g of day.games ?? []) {
      const homeName = g.teams?.home?.team?.name
      const awayName = g.teams?.away?.team?.name
      if (g.gamePk == null || seen.has(g.gamePk) || !homeName || !awayName) continue
      seen.add(g.gamePk)
      const startsAt = g.gameDate ? new Date(g.gameDate) : undefined
      const [hs, as] = [score(g.teams?.home), score(g.teams?.away)]
      let status = mapMlbStatus(g.status)
      if (status === "final" && (hs == null || as == null)) status = "in_progress"
      const final = status === "final"
      out.push({
        source: "mlb-statsapi",
        family: "mlb-statsapi",
        externalId: String(g.gamePk),
        homeName,
        awayName,
        startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : undefined,
        status,
        homeScore: final ? hs : null,
        awayScore: final ? as : null,
        // "Completed early" is a shortened game: still graded, but not eligible for the fast path.
        ...(final && /^(final|game over)/i.test(g.status?.detailedState ?? "") ? { officialFinal: true } : {}),
      })
    }
  }
  return out
}

const DAY = 86_400_000
const MAX_DAYS = 10
const CACHE_MS = 60_000
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

export class MlbResultsProvider implements ResultsProvider {
  readonly name = "mlb-statsapi"
  readonly family = "mlb-statsapi"
  readonly sports: readonly Sport[] = ["mlb"]
  private readonly fetchFn: typeof fetch
  private readonly baseUrl: string
  private readonly cache = new Map<string, { at: number; board: MlbSchedule }>()
  constructor(fetchFn: typeof fetch = fetch, baseUrl = "https://statsapi.mlb.com/api/v1") {
    this.fetchFn = fetchFn
    this.baseUrl = baseUrl
  }

  async fetchResults(sport: Sport, events: EventRef[]): Promise<EventResult[]> {
    if (sport !== "mlb" || events.length === 0) return []
    const times = events.map((e) => e.startsAt.getTime())
    // officialDate is the local day; a day either side covers every time zone. Older than MAX_DAYS is past the no-result void anyway.
    const first = Math.max(Math.min(...times) - DAY, Math.max(...times) + DAY - MAX_DAYS * DAY)
    const last = Math.max(...times) + DAY
    const start = isoDay(first)
    const end = isoDay(last)
    const key = `${start}:${end}`
    const now = Date.now()
    const hit = this.cache.get(key)
    if (hit && now - hit.at < CACHE_MS) return normalizeMlbSchedule(hit.board)
    const res = await this.fetchFn(`${this.baseUrl}/schedule?sportId=1&startDate=${start}&endDate=${end}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "application/json" },
    })
    if (!res.ok) throw new Error(`mlb-statsapi schedule failed with ${res.status}`)
    const board = (await res.json()) as MlbSchedule
    this.cache.set(key, { at: now, board })
    return normalizeMlbSchedule(board)
  }
}
