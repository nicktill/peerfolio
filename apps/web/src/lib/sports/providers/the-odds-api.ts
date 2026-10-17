import type { BookQuote, EventRef, EventResult, OddsProvider, OddsSnapshot, ProviderEvent, ProviderMarket, ResultsProvider, Selection, Sport } from "../types.ts"

/**
 * Adapter for The Odds API v4 (the-odds-api.com). UNVERIFIED against the live
 * service: the response shapes below follow the public v4 docs as remembered,
 * and no provider site was reachable while this was written. The pure
 * `normalize*` functions are covered by fixture tests; confirm against a real
 * key before enabling (see docs/sports/STATUS.md).
 *
 * The key comes from THE_ODDS_API_KEY and is only ever sent as a query
 * parameter to the provider; it is never logged or returned to clients.
 */

const DEFAULT_BASE = "https://api.the-odds-api.com/v4"

const FIXED_KEYS: Partial<Record<Sport, string>> = {
  nfl: "americanfootball_nfl",
  nba: "basketball_nba",
  nhl: "icehockey_nhl",
  mlb: "baseball_mlb",
  cfb: "americanfootball_ncaaf",
  mls: "soccer_usa_mls",
}

/** Prop markets requested per sport. Each costs 1 credit per event per region. */
export const PROP_MARKETS: Record<Sport, string[]> = {
  nfl: ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"],
  nba: ["player_points", "player_rebounds", "player_assists", "player_threes"],
  tennis: [],
  nhl: [],
  mlb: [],
  cfb: [],
  mls: [],
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

type RawOutcome = { name: string; description?: string; price: number; point?: number }
type RawBookmaker = { key: string; last_update?: string; markets: { key: string; outcomes: RawOutcome[] }[] }
type RawEvent = { id: string; commence_time: string; home_team: string; away_team: string; bookmakers?: RawBookmaker[] }

const addQuote = (map: Map<string, ProviderMarket>, key: string, kind: ProviderMarket["kind"], player: string | undefined, selection: Selection, q: BookQuote) => {
  const id = `${key}|${player ?? ""}`
  const market = map.get(id) ?? { key, kind, player, outcomes: [] }
  let outcome = market.outcomes.find((o) => o.selection === selection)
  if (!outcome) market.outcomes.push((outcome = { selection, quotes: [] }))
  outcome.quotes.push(q)
  map.set(id, market)
}

/** Pure: raw provider event -> neutral event. Unknown markets are ignored. */
export function normalizeOddsApiEvent(raw: RawEvent, sport: Sport): ProviderEvent {
  const markets = new Map<string, ProviderMarket>()
  for (const book of raw.bookmakers ?? []) {
    for (const m of book.markets) {
      for (const o of m.outcomes) {
        if (!Number.isFinite(o.price)) continue
        const at = book.last_update ? new Date(book.last_update) : undefined
        const q: BookQuote = { book: book.key, price: o.price, point: o.point ?? null, at: at && !Number.isNaN(at.getTime()) ? at : undefined }
        if (m.key === "h2h") {
          const side = o.name === raw.home_team ? "home" : o.name === raw.away_team ? "away" : null
          if (side) addQuote(markets, "moneyline", "moneyline", undefined, side, q)
        } else if (m.key === "spreads") {
          const side = o.name === raw.home_team ? "home" : o.name === raw.away_team ? "away" : null
          if (side && o.point != null) addQuote(markets, "spread", "spread", undefined, side, q)
        } else if (m.key === "totals") {
          const side = o.name === "Over" ? "over" : o.name === "Under" ? "under" : null
          if (side && o.point != null) addQuote(markets, "total", "total", undefined, side, q)
        } else if (m.key.startsWith("player_") && o.description) {
          const side = o.name === "Over" ? "over" : o.name === "Under" ? "under" : null
          if (side && o.point != null) addQuote(markets, m.key, "player_prop", o.description, side, q)
        }
      }
    }
  }
  return {
    externalId: raw.id,
    sport,
    homeName: raw.home_team,
    awayName: raw.away_team,
    startsAt: new Date(raw.commence_time),
    markets: [...markets.values()],
  }
}

/** Merges per-event prop markets into the game event. */
export const mergeMarkets = (base: ProviderEvent, extra: ProviderEvent): ProviderEvent => ({
  ...base,
  markets: [...base.markets, ...extra.markets.filter((m) => m.kind === "player_prop")],
})

export class TheOddsApiProvider implements OddsProvider, ResultsProvider {
  private readonly apiKey: string
  private readonly fetchFn: FetchLike
  private readonly opts: { includeProps: boolean; maxPropEvents: number }
  readonly name: string
  private readonly baseUrl: string
  /** Odds-API-compatible vendors resell the same upstream, so they all share one family and count once. */
  readonly family = "the-odds-api"

  /** `name` and `baseUrl` are overridable so an Odds-API-compatible vendor (PropLine claims this shape; UNVERIFIED) can reuse the adapter. */
  constructor(
    apiKey: string,
    fetchFn: FetchLike = (url) => fetch(url, { cache: "no-store" }),
    opts: { includeProps: boolean; maxPropEvents: number } = { includeProps: false, maxPropEvents: 8 },
    name = "the-odds-api",
    baseUrl = DEFAULT_BASE,
  ) {
    this.apiKey = apiKey
    this.fetchFn = fetchFn
    this.opts = opts
    this.name = name
    this.baseUrl = baseUrl
  }

  /** The first key. Either THE_ODDS_API_KEY or the shorter ODDS_API_KEY works. */
  static fromEnv(): TheOddsApiProvider {
    const key = process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY
    if (!key) throw new Error("THE_ODDS_API_KEY is not set")
    return new TheOddsApiProvider(key, undefined, { includeProps: process.env.SPORTS_PROPS_ENABLED === "1", maxPropEvents: 8 })
  }

  /** A second key from a separate account of the same service, with its own credit budget. THE_ODDS_API_KEY_TWO or ODDS_API_KEY_TWO. */
  static secondFromEnv(): TheOddsApiProvider | null {
    const key = process.env.THE_ODDS_API_KEY_TWO ?? process.env.ODDS_API_KEY_TWO
    if (!key) return null
    return new TheOddsApiProvider(key, undefined, { includeProps: process.env.SPORTS_PROPS_ENABLED === "1", maxPropEvents: 8 }, "the-odds-api-2")
  }

  /** Same adapter pointed at an Odds-API-compatible vendor (e.g. PropLine). UNVERIFIED shape. */
  static compatibleFromEnv(name: string, keyVar: string, baseVar: string): TheOddsApiProvider | null {
    const key = process.env[keyVar]
    const base = process.env[baseVar]
    if (!key || !base) return null
    return new TheOddsApiProvider(key, undefined, { includeProps: process.env.SPORTS_PROPS_ENABLED === "1", maxPropEvents: 8 }, name, base)
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ ...params, apiKey: this.apiKey })
    const res = await this.fetchFn(`${this.baseUrl}${path}?${qs}`)
    // Never include the URL (it carries the key) in errors.
    if (!res.ok) throw new Error(`the-odds-api ${path} failed with ${res.status}`)
    return (await res.json()) as T
  }

  /** Tennis has one sport key per tournament; find the ones in play. `/sports` is free; its answer is reused for a few minutes. */
  private keyCache = new Map<Sport, { at: number; keys: string[] }>()
  private async sportKeys(sport: Sport): Promise<string[]> {
    const fixed = FIXED_KEYS[sport]
    if (fixed) return [fixed]
    const hit = this.keyCache.get(sport)
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit.keys
    const all = await this.get<{ key: string; active: boolean }[]>("/sports", {})
    const keys = all.filter((s) => s.active && s.key.startsWith("tennis_")).map((s) => s.key)
    this.keyCache.set(sport, { at: Date.now(), keys })
    return keys
  }

  /** Credits one odds fetch makes: 3 game markets per sport key, plus props one event at a time. Follows the real number of keys. */
  async estimateCost(sport: Sport): Promise<number> {
    const keys = (await this.sportKeys(sport)).length
    const props = this.opts.includeProps ? PROP_MARKETS[sport].length * this.opts.maxPropEvents * keys : 0
    return 3 * keys + props
  }

  private lastResultsCredits = 0
  /** Set by {@link meterResults}. Left unset, settlement treats this source as free (tests, scripts). */
  metered?: NonNullable<ResultsProvider["metered"]>
  /**
   * Bills `/scores?daysFrom` (2 credits per sport key per call, per the Odds API docs; not confirmed with a key) against its own
   * monthly share, recorded under `usageName`, so settlement can never spend the odds budget.
   */
  meterResults(usageName: string, monthly: number): this {
    this.metered = {
      usageName,
      plan: { monthly, safety: 0.9, dayBurst: 2 },
      estimate: async (sport) => 2 * (await this.sportKeys(sport)).length,
      lastCredits: () => this.lastResultsCredits,
    }
    return this
  }

  async fetchOdds(sport: Sport, now: Date): Promise<OddsSnapshot> {
    const events: ProviderEvent[] = []
    let credits = 0
    for (const key of await this.sportKeys(sport)) {
      const raw = await this.get<RawEvent[]>(`/sports/${key}/odds`, { regions: "us", markets: "h2h,spreads,totals", oddsFormat: "american" })
      credits += 3
      let batch: ProviderEvent[] = raw.map((r) => ({ ...normalizeOddsApiEvent(r, sport), family: this.family })).filter((e) => e.startsAt.getTime() > now.getTime())

      const propMarkets = PROP_MARKETS[sport]
      if (this.opts.includeProps && propMarkets.length) {
        const soonest = [...batch].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).slice(0, this.opts.maxPropEvents)
        const enriched = new Map<string, ProviderEvent>()
        for (const e of soonest) {
          const rawProps = await this.get<RawEvent>(`/sports/${key}/events/${e.externalId}/odds`, {
            regions: "us",
            markets: propMarkets.join(","),
            oddsFormat: "american",
          })
          credits += propMarkets.length
          enriched.set(e.externalId, mergeMarkets(e, normalizeOddsApiEvent(rawProps, sport)))
        }
        batch = batch.map((e) => enriched.get(e.externalId) ?? e)
      }
      events.push(...batch)
    }
    return { provider: this.name, fetchedAt: new Date(), events, credits }
  }

  async fetchResults(sport: Sport, events: EventRef[]): Promise<EventResult[]> {
    const wanted = new Set(events.map((e) => e.externalId))
    const out: EventResult[] = []
    this.lastResultsCredits = 0
    for (const key of await this.sportKeys(sport)) {
      this.lastResultsCredits += 2
      const raw = await this.get<
        { id: string; commence_time?: string; completed: boolean; home_team: string; away_team: string; scores: { name: string; score: string }[] | null }[]
      >(`/sports/${key}/scores`, { daysFrom: "3" })
      for (const r of raw) {
        const startsAt = r.commence_time ? new Date(r.commence_time) : undefined
        // Either our id, or (for a fallback match) names + time are enough.
        if (!wanted.has(r.id) && !startsAt) continue
        const score = (team: string) => {
          const s = r.scores?.find((x) => x.name === team)?.score
          const n = s == null ? Number.NaN : Number(s)
          return Number.isFinite(n) ? n : null
        }
        const home = r.completed ? score(r.home_team) : null
        const away = r.completed ? score(r.away_team) : null
        // A "completed" game with an unreadable score is not a final.
        const final = r.completed && home != null && away != null
        out.push({
          source: this.name,
          family: this.family,
          externalId: r.id,
          homeName: r.home_team,
          awayName: r.away_team,
          startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : undefined,
          // This feed cannot say postponed/cancelled/retired. Resolution voids a game with no final long after its start.
          status: final ? "final" : "in_progress",
          homeScore: final ? home : null,
          awayScore: final ? away : null,
        })
      }
    }
    return out
  }
}
