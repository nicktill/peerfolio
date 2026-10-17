import type { EventRef, EventResult, ResultsProvider, ResultStatus, Sport } from "../types.ts"

/**
 * The NHL's own public schedule JSON (api-web.nhle.com) as a results source. Keyless and free, and operated by the league
 * itself, so its family ("nhl-api") is independent of ESPN: two families agreeing on an NHL final is real corroboration.
 * Results only; it never reads or sends a key and imports nothing from the pricing side.
 *
 * `/schedule/{date}` answers with the whole week starting at that date, scores included, so a few days of events cost
 * one call. Answers are cached briefly so a cron that settles several events asks once.
 */

type Team = { placeName?: { default?: string }; commonName?: { default?: string }; name?: { default?: string }; abbrev?: string; score?: number }
type Game = { id?: number; startTimeUTC?: string; gameState?: string; gameScheduleState?: string; awayTeam?: Team; homeTeam?: Team }
export type NhlSchedule = { gameWeek?: { date?: string; games?: Game[] }[] }

export function mapNhlStatus(game: Pick<Game, "gameState" | "gameScheduleState">): ResultStatus {
  const sched = (game.gameScheduleState ?? "").toUpperCase()
  const state = (game.gameState ?? "").toUpperCase()
  if (sched === "PPD") return "postponed"
  if (sched === "CNCL") return "cancelled"
  if (state === "FINAL" || state === "OFF") return "final"
  if (state === "LIVE" || state === "CRIT" || sched === "SUSP") return "in_progress"
  return "scheduled"
}

const teamName = (t: Team | undefined) => {
  const place = t?.placeName?.default?.trim()
  const common = (t?.commonName?.default ?? t?.name?.default)?.trim()
  return place && common ? `${place} ${common}` : common || place || undefined
}
const score = (t: Team | undefined): number | null => (typeof t?.score === "number" && Number.isFinite(t.score) ? t.score : null)

export function normalizeNhlSchedule(board: NhlSchedule): EventResult[] {
  const out: EventResult[] = []
  const seen = new Set<number>()
  for (const day of board.gameWeek ?? []) {
    for (const g of day.games ?? []) {
      if (g.id == null || seen.has(g.id)) continue
      const homeName = teamName(g.homeTeam)
      const awayName = teamName(g.awayTeam)
      if (!homeName || !awayName) continue
      seen.add(g.id)
      const startsAt = g.startTimeUTC ? new Date(g.startTimeUTC) : undefined
      const [hs, as] = [score(g.homeTeam), score(g.awayTeam)]
      let status = mapNhlStatus(g)
      // A "final" with an unreadable score is not a final.
      if (status === "final" && (hs == null || as == null)) status = "in_progress"
      const final = status === "final"
      out.push({
        source: "nhl-api",
        family: "nhl-api",
        externalId: String(g.id),
        homeName,
        awayName,
        startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : undefined,
        status,
        homeScore: final ? hs : null,
        awayScore: final ? as : null,
      })
    }
  }
  return out
}

const DAY = 86_400_000
const MAX_WEEKS = 3
const CACHE_MS = 60_000
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

export class NhlResultsProvider implements ResultsProvider {
  readonly name = "nhl-api"
  readonly family = "nhl-api"
  readonly sports: readonly Sport[] = ["nhl"]
  private readonly fetchFn: typeof fetch
  private readonly baseUrl: string
  private readonly cache = new Map<string, { at: number; board: NhlSchedule }>()
  constructor(fetchFn: typeof fetch = fetch, baseUrl = "https://api-web.nhle.com/v1") {
    this.fetchFn = fetchFn
    this.baseUrl = baseUrl
  }

  private async week(date: string, now: number): Promise<NhlSchedule> {
    const hit = this.cache.get(date)
    if (hit && now - hit.at < CACHE_MS) return hit.board
    const res = await this.fetchFn(`${this.baseUrl}/schedule/${date}`, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } })
    if (!res.ok) throw new Error(`nhl-api schedule ${date} failed with ${res.status}`)
    const board = (await res.json()) as NhlSchedule
    this.cache.set(date, { at: now, board })
    return board
  }

  async fetchResults(sport: Sport, events: EventRef[]): Promise<EventResult[]> {
    if (sport !== "nhl" || events.length === 0) return []
    const times = events.map((e) => e.startsAt.getTime())
    // Games are dated by their local day; a day either side covers every time zone.
    const first = Math.min(...times) - DAY
    const last = Math.max(...times) + DAY
    const now = Date.now()
    const out = new Map<string, EventResult>()
    for (let t = first, n = 0; t <= last && n < MAX_WEEKS; t += 7 * DAY, n++) {
      for (const r of normalizeNhlSchedule(await this.week(isoDay(t), now))) out.set(r.externalId, r)
    }
    return [...out.values()]
  }
}
