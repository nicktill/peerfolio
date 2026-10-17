import type { EventRef, EventResult, ResultsProvider, ResultStatus, Sport } from "../types.ts"

/**
 * ESPN's public scoreboard JSON as a results source. It is unofficial and undocumented, so it sits behind the
 * same interface as every other source: it can break or be turned off without touching settlement. Its own
 * upstream family ("espn") means it never counts as the same source as an odds vendor.
 *
 * Opt-in (ESPN_RESULTS_ENABLED=1) until its terms for this use are confirmed. Never reads or sends any key.
 */

const LEAGUES: Record<Sport, string[]> = {
  nfl: ["football/nfl"],
  nba: ["basketball/nba"],
  tennis: ["tennis/atp", "tennis/wta"],
  nhl: ["hockey/nhl"],
  mlb: ["baseball/mlb"],
  cfb: ["football/college-football"],
  mls: ["soccer/usa.1"],
}

type Competitor = {
  homeAway?: string
  order?: number
  score?: string
  winner?: boolean
  team?: { displayName?: string; location?: string }
  athlete?: { displayName?: string }
  linescores?: { value?: number }[]
}
type Status = { type?: { name?: string; state?: string; completed?: boolean } }
type Competition = { id?: string; date?: string; status?: Status; competitors?: Competitor[] }
type RawEvent = { id?: string; date?: string; status?: Status; competitions?: Competition[]; groupings?: { competitions?: Competition[] }[] }
export type EspnScoreboard = { events?: RawEvent[] }

export function mapStatus(status: Status | undefined): ResultStatus {
  const name = status?.type?.name ?? ""
  if (/POSTPONED/.test(name)) return "postponed"
  if (/CANCEL/.test(name) || /ABANDON/.test(name)) return "cancelled"
  if (/RETIRED|WALKOVER|FORFEIT/.test(name)) return "retired"
  if (status?.type?.completed || /FINAL/.test(name)) return "final"
  if (status?.type?.state === "in" || /IN_PROGRESS|HALFTIME|END_PERIOD|SUSPENDED|DELAY|RAIN/.test(name)) return "in_progress"
  return "scheduled"
}

const num = (s: string | undefined): number | null => {
  if (s == null || s === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** One competition (a game or a tennis match) as our result shape. Pure, so it is tested on a fixture. */
export function normalizeCompetition(c: Competition, fallbackDate: string | undefined, sport: Sport): EventResult | null {
  const comps = c.competitors ?? []
  if (comps.length !== 2) return null
  const startsAt = c.date ?? fallbackDate ? new Date((c.date ?? fallbackDate)!) : undefined
  const status = mapStatus(c.status)

  if (sport === "tennis") {
    // Two players in order. Score is sets won; a retirement is a retirement, not a loss.
    const [a, b] = [...comps].sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
    if (!a?.athlete?.displayName || !b?.athlete?.displayName) return null
    const sets = (p: Competitor, q: Competitor) => (p.linescores ?? []).reduce((n, s, i) => n + ((s.value ?? 0) > (q.linescores?.[i]?.value ?? 0) ? 1 : 0), 0)
    const done = status === "final"
    return {
      source: "espn",
      family: "espn",
      externalId: c.id ?? "",
      homeName: a.athlete.displayName,
      awayName: b.athlete.displayName,
      startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : undefined,
      status,
      homeScore: done ? sets(a, b) : null,
      awayScore: done ? sets(b, a) : null,
    }
  }

  const home = comps.find((x) => x.homeAway === "home")
  const away = comps.find((x) => x.homeAway === "away")
  if (!home?.team?.displayName || !away?.team?.displayName) return null
  const [hs, as] = [num(home.score), num(away.score)]
  // A "final" with an unreadable score is not a final.
  const final = status === "final" && hs != null && as != null
  return {
    source: "espn",
    family: "espn",
    externalId: c.id ?? "",
    homeName: home.team.displayName,
    awayName: away.team.displayName,
    ...(home.team.location && away.team.location ? { homeShort: home.team.location, awayShort: away.team.location } : {}),
    startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : undefined,
    status: status === "final" && !final ? "in_progress" : status,
    homeScore: final ? hs : null,
    awayScore: final ? as : null,
  }
}

export function normalizeScoreboard(board: EspnScoreboard, sport: Sport): EventResult[] {
  const out: EventResult[] = []
  for (const e of board.events ?? []) {
    const comps = sport === "tennis" ? (e.groupings ?? []).flatMap((g) => g.competitions ?? []) : (e.competitions ?? [])
    for (const c of comps) {
      const r = normalizeCompetition(c, e.date, sport)
      if (r && r.externalId) out.push(r)
    }
  }
  return out
}

/** Most scoreboard days asked per sport in one run; older events are past the no-result void anyway. */
const MAX_DAYS = 10
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "")

export class EspnResultsProvider implements ResultsProvider {
  readonly name = "espn"
  readonly family = "espn"
  private readonly fetchFn: typeof fetch
  private readonly baseUrl: string
  constructor(fetchFn: typeof fetch = fetch, baseUrl = "https://site.api.espn.com/apis/site/v2/sports") {
    this.fetchFn = fetchFn
    this.baseUrl = baseUrl
  }

  /**
   * Games ESPN lists as not started, with a start in (now, now + ms]. Asks one scoreboard per US Eastern day the window touches
   * (2 to 3 calls), not the wider range settlement uses. Throws when ESPN cannot answer.
   */
  async schedule(sport: Sport, now: Date, ms = 86_400_000): Promise<EventResult[]> {
    const days = new Set<string>()
    // ESPN dates games by their US Eastern day (UTC-4/-5): shift back 5 hours, and add the window's own end, so DST cannot drop a day.
    for (let t = now.getTime() - 6 * 3_600_000; t <= now.getTime() + ms + 3_600_000; t += 6 * 3_600_000) days.add(day(new Date(t - 5 * 3_600_000)))
    days.add(day(new Date(now.getTime() + ms - 4 * 3_600_000)))
    const seen = new Set<string>()
    const out: EventResult[] = []
    for (const league of LEAGUES[sport]) {
      // Tennis returns the whole tournament week for any date.
      const dates = sport === "tennis" ? [[...days][0]!] : [...days]
      for (const d of dates) {
        const res = await this.fetchFn(`${this.baseUrl}/${league}/scoreboard?dates=${d}&limit=300`, { signal: AbortSignal.timeout(8_000) })
        if (!res.ok) throw new Error(`espn ${league} scoreboard failed with ${res.status}`)
        for (const r of normalizeScoreboard((await res.json()) as EspnScoreboard, sport)) {
          if (seen.has(r.externalId)) continue
          seen.add(r.externalId)
          out.push(r)
        }
      }
    }
    return out.filter((r) => r.status === "scheduled" && r.startsAt != null && r.startsAt.getTime() > now.getTime() && r.startsAt.getTime() <= now.getTime() + ms)
  }

  /** Free schedule check: does ESPN list a game for this sport starting within `ms` from now? null when ESPN cannot say. */
  async hasGameWithin(sport: Sport, now: Date, ms = 86_400_000): Promise<boolean | null> {
    try {
      return (await this.schedule(sport, now, ms)).length > 0
    } catch {
      return null
    }
  }

  async fetchResults(sport: Sport, events: EventRef[]): Promise<EventResult[]> {
    if (events.length === 0) return []
    const times = events.map((e) => e.startsAt.getTime())
    // Evening games in the US land on the next UTC day, so look a day either side.
    const first = Math.min(...times) - 86_400_000
    const last = Math.max(...times) + 86_400_000
    // ESPN answers a date RANGE with HTTP 400 for NFL/NBA scoreboards (verified live 2026-10-17; tennis and MMA still accept
    // it). A single day works everywhere, and its day is the US Eastern one, which the day either side above covers.
    // Tennis returns the whole tournament week for any date, so one request is enough there.
    const dates: string[] = []
    if (sport === "tennis") dates.push(`${day(new Date(first))}-${day(new Date(last))}`)
    else for (let t = first; t <= last && dates.length < MAX_DAYS; t += 86_400_000) dates.push(day(new Date(t)))
    const seen = new Set<string>()
    const out: EventResult[] = []
    for (const league of LEAGUES[sport]) {
      for (const d of dates) {
        const res = await this.fetchFn(`${this.baseUrl}/${league}/scoreboard?dates=${d}&limit=300`, { signal: AbortSignal.timeout(8_000) })
        if (!res.ok) throw new Error(`espn ${league} scoreboard failed with ${res.status}`)
        for (const r of normalizeScoreboard((await res.json()) as EspnScoreboard, sport)) {
          if (seen.has(r.externalId)) continue
          seen.add(r.externalId)
          out.push(r)
        }
      }
    }
    return out
  }
}
