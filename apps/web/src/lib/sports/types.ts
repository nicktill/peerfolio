/**
 * Shared sports types. Plain data, no imports, so pure modules and tests can
 * load it directly under node's type stripping.
 *
 * Credits are virtual and always whole integers. Odds are American integers.
 */

export type Sport = "nfl" | "nba" | "tennis" | "nhl" | "mlb" | "cfb" | "mls"
export const SPORTS: readonly Sport[] = ["nfl", "nba", "tennis", "nhl", "mlb", "cfb", "mls"]

export type MarketKind = "moneyline" | "spread" | "total" | "player_prop"

/** Tennis: home = first-listed player, away = second. "draw" exists only on the three-way soccer moneyline (see hasDraw). */
export type Selection = "home" | "away" | "over" | "under" | "draw"

/** Whether a market is three-way (home / draw / away). Soccer's moneyline only; spreads and totals are two-way everywhere. */
export const hasDraw = (sport: string | undefined, kind: string): boolean => sport === "mls" && kind === "moneyline"

/* ---- provider odds (what a vendor reports) ---- */

/** `at` is when the book last updated this price. A quote with no timestamp is trusted only as fresh as its snapshot. */
export type BookQuote = { book: string; price: number; point: number | null; at?: Date }

export type ProviderOutcome = { selection: Selection; quotes: BookQuote[] }

export type ProviderMarket = {
  /** Provider-neutral key: "moneyline" | "spread" | "total" | a prop stat key such as "player_pass_yds". */
  key: string
  kind: MarketKind
  /** Set for player props. */
  player?: string
  outcomes: ProviderOutcome[]
}

export type ProviderEvent = {
  externalId: string
  /** Upstream family that issued `externalId`. Results ids only match within it. */
  family?: string
  sport: Sport
  homeName: string
  awayName: string
  startsAt: Date
  markets: ProviderMarket[]
}

export type OddsSnapshot = {
  provider: string
  fetchedAt: Date
  events: ProviderEvent[]
  /** Set by the composite: which sources contributed and which were skipped, and why. */
  notes?: string[]
  /** False when a source failed or was skipped, so absence from this snapshot proves nothing. Undefined means complete. */
  complete?: boolean
  /** `externalId::marketKey` of published-able markets a quality gate hid this run while the game is still scheduled. The guard holds them (neither freezes nor reopens): a gate miss is not a withdrawal. */
  held?: string[]
  /** Credits the fetch actually cost, counted from the requests made. Absent: the caller's estimate stands. */
  credits?: number
}

export interface OddsProvider {
  readonly name: string
  fetchOdds(sport: Sport, now: Date): Promise<OddsSnapshot>
  /** What the next fetch for this sport will cost, from the real number of requests it will make (tennis: one per active tournament). */
  estimateCost?(sport: Sport): Promise<number>
}

/* ---- provider results (what actually happened) ---- */

export type ResultStatus = "scheduled" | "in_progress" | "final" | "postponed" | "cancelled" | "retired"

export type EventResult = {
  source: string
  /** Upstream data family. Vendors that resell the same feed share one family and count as ONE source. Defaults to `source`. */
  family?: string
  externalId: string
  /** Names and start time let a vendor with different ids still be matched to our event. */
  homeName?: string
  awayName?: string
  /** The team's place or school without its nickname (ESPN `location`: "Troy" for "Troy Trojans"). Used only to match exchange titles. */
  homeShort?: string
  awayShort?: string
  startsAt?: Date
  status: ResultStatus
  homeScore: number | null
  awayScore: number | null
  /** Soccer: the final went past 90 minutes (extra time or penalties), so the score is not the three-way result. Settlement sends it to review. */
  beyondRegulation?: boolean
  /** player name -> stat key -> value. Present only when the source has box scores. */
  playerStats?: Record<string, Record<string, number>>
}

/** What a results source needs to find a game: ids differ across vendors, so names and time travel too. */
export type EventRef = {
  externalId: string
  homeName: string
  awayName: string
  startsAt: Date
  /** The event has player props open: a source with box scores should attach `playerStats` to its final. */
  wantPlayerStats?: boolean
}

export interface ResultsProvider {
  readonly name: string
  readonly family?: string
  /** Sports this source can answer for; unset means any. Settlement counts a source toward a sport's quorum only if it covers it. */
  readonly sports?: readonly Sport[]
  fetchResults(sport: Sport, events: EventRef[]): Promise<EventResult[]>
  /**
   * Set on sources that bill per call. Settlement asks these only when a free source already shows a final, within the
   * plan's pace, and records what they cost under `usageName`. Free sources (ESPN) leave it unset.
   */
  metered?: {
    usageName: string
    plan: { monthly: number; safety: number; dayBurst: number }
    estimate(sport: Sport): Promise<number>
    /** Credits the most recent fetchResults actually used. */
    lastCredits(): number
  }
}

/* ---- lifecycle ---- */

export type MarketStatus = "draft" | "open" | "locked" | "settled" | "void"
export type PickStatus = "open" | "won" | "lost" | "push" | "void"
export type Outcome = "win" | "loss" | "push" | "void"
