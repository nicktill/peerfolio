/**
 * Shared sports types. Plain data, no imports, so pure modules and tests can
 * load it directly under node's type stripping.
 *
 * Credits are virtual and always whole integers. Odds are American integers.
 */

export type Sport = "nfl" | "nba" | "tennis"
export const SPORTS: readonly Sport[] = ["nfl", "nba", "tennis"]

export type MarketKind = "moneyline" | "spread" | "total" | "player_prop"

/** Tennis: home = first-listed player, away = second. */
export type Selection = "home" | "away" | "over" | "under"

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
}

export interface OddsProvider {
  readonly name: string
  fetchOdds(sport: Sport, now: Date): Promise<OddsSnapshot>
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
  startsAt?: Date
  status: ResultStatus
  homeScore: number | null
  awayScore: number | null
  /** player name -> stat key -> value. Present only when the source has box scores. */
  playerStats?: Record<string, Record<string, number>>
}

/** What a results source needs to find a game: ids differ across vendors, so names and time travel too. */
export type EventRef = { externalId: string; homeName: string; awayName: string; startsAt: Date }

export interface ResultsProvider {
  readonly name: string
  readonly family?: string
  fetchResults(sport: Sport, events: EventRef[]): Promise<EventResult[]>
}

/* ---- lifecycle ---- */

export type MarketStatus = "draft" | "open" | "locked" | "settled" | "void"
export type PickStatus = "open" | "won" | "lost" | "push" | "void"
export type Outcome = "win" | "loss" | "push" | "void"
