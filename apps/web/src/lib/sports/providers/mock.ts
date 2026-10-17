import type { BookQuote, EventRef, EventResult, OddsProvider, OddsSnapshot, ProviderEvent, ResultsProvider, Sport } from "../types.ts"

/**
 * Deterministic mock provider for local dev, demos and tests. No network.
 * Four fake books quote slightly different prices around a fixed fair line.
 */

const BOOKS = ["bookA", "bookB", "bookC", "bookD"]

const quotes = (prices: number[], point: number | null = null): BookQuote[] => prices.map((price, i) => ({ book: BOOKS[i]!, price, point }))

const TEAMS: Record<Sport, [string, string][]> = {
  nfl: [["Kansas City Chiefs", "Buffalo Bills"], ["Philadelphia Eagles", "Dallas Cowboys"], ["San Francisco 49ers", "Detroit Lions"]],
  nba: [["Boston Celtics", "New York Knicks"], ["Denver Nuggets", "Phoenix Suns"], ["Milwaukee Bucks", "Miami Heat"]],
  tennis: [["Carlos Alcaraz", "Jannik Sinner"], ["Iga Swiatek", "Aryna Sabalenka"], ["Novak Djokovic", "Daniil Medvedev"]],
}
const PLAYERS: Record<Sport, string[]> = {
  nfl: ["Patrick Mahomes", "Jalen Hurts", "Brock Purdy"],
  nba: ["Jayson Tatum", "Nikola Jokic", "Giannis Antetokounmpo"],
  tennis: ["", "", ""],
}

export function mockEvent(sport: Sport, n: number, startsAt: Date): ProviderEvent {
  const id = `mock-${sport}-${n}`
  const markets: ProviderEvent["markets"] = [
    {
      key: "moneyline",
      kind: "moneyline",
      outcomes: [
        { selection: "home", quotes: quotes([-150, -145, -155, -150]) },
        { selection: "away", quotes: quotes([130, 125, 135, 130]) },
      ],
    },
    {
      key: "total",
      kind: "total",
      outcomes: [
        { selection: "over", quotes: quotes([-110, -108, -112, -110], sport === "nba" ? 224.5 : sport === "tennis" ? 22.5 : 44.5) },
        { selection: "under", quotes: quotes([-110, -112, -108, -110], sport === "nba" ? 224.5 : sport === "tennis" ? 22.5 : 44.5) },
      ],
    },
  ]
  if (sport !== "tennis") {
    markets.push({
      key: "spread",
      kind: "spread",
      outcomes: [
        { selection: "home", quotes: quotes([-110, -110, -108, -112], -3.5) },
        { selection: "away", quotes: quotes([-110, -110, -112, -108], 3.5) },
      ],
    })
    markets.push({
      key: sport === "nfl" ? "player_pass_yds" : "player_points",
      kind: "player_prop",
      player: PLAYERS[sport][(n - 1) % 3],
      outcomes: [
        { selection: "over", quotes: quotes([-115, -110, -115, -112], sport === "nfl" ? 249.5 : 26.5) },
        { selection: "under", quotes: quotes([-105, -110, -105, -108], sport === "nfl" ? 249.5 : 26.5) },
      ],
    })
  }
  const [home, away] = TEAMS[sport][(n - 1) % 3]!
  return { externalId: id, family: "mock", sport, homeName: home, awayName: away, startsAt, markets }
}

export class MockProvider implements OddsProvider, ResultsProvider {
  /** Optional canned results by external id, for tests and local play. */
  private readonly results: Record<string, Omit<EventResult, "source" | "externalId">>
  readonly name: string
  readonly family = "mock"
  constructor(results: Record<string, Omit<EventResult, "source" | "externalId">> = {}, name = "mock") {
    this.results = results
    this.name = name
  }

  async fetchOdds(sport: Sport, now: Date): Promise<OddsSnapshot> {
    const events = [1, 2, 3].map((n) => mockEvent(sport, n, new Date(now.getTime() + (6 + n * 5) * 3600_000)))
    return { provider: this.name, fetchedAt: now, events }
  }

  async fetchResults(_sport: Sport, events: EventRef[]): Promise<EventResult[]> {
    return events.map((e) => e.externalId).flatMap((id) => (this.results[id] ? [{ ...this.results[id]!, source: this.name, externalId: id }] : []))
  }
}
