/** Display helpers for odds and markets. Pure. */

export const formatOdds = (american: number): string => (american > 0 ? `+${american}` : `${american}`)

export const formatPoint = (point: number | null): string => (point == null ? "" : point > 0 ? `+${point}` : `${point}`)

const STAT_LABELS: Record<string, string> = {
  player_pass_yds: "passing yards",
  player_rush_yds: "rushing yards",
  player_reception_yds: "receiving yards",
  player_receptions: "receptions",
  player_points: "points",
  player_rebounds: "rebounds",
  player_assists: "assists",
  player_threes: "threes made",
}

export const statLabel = (key: string | null): string => (key ? (STAT_LABELS[key] ?? key.replace(/^player_/, "").replace(/_/g, " ")) : "")

export const SPORT_LABEL: Record<string, string> = { nfl: "NFL", nba: "NBA", tennis: "Tennis" }

export type DisplayMarket = {
  kind: string
  player: string | null
  statKey: string | null
  event: { home: string; away: string }
}
export type DisplayLine = { selection: string; point: number | null }

/** The pick's name as the user reads it: "Chiefs -2.5", "Over 47.5", "P Mahomes over 275.5 passing yards". */
export function lineLabel(market: DisplayMarket, line: DisplayLine): { name: string; point: string } {
  const team = line.selection === "home" ? market.event.home : market.event.away
  switch (market.kind) {
    case "moneyline":
      return { name: team, point: "" }
    case "spread":
      return { name: team, point: formatPoint(line.point) }
    case "total":
      return { name: line.selection === "over" ? "Over" : "Under", point: `${line.point}` }
    default:
      return { name: `${line.selection === "over" ? "Over" : "Under"}`, point: `${line.point}` }
  }
}

export function marketTitle(market: DisplayMarket): string {
  switch (market.kind) {
    case "moneyline":
      return "Winner"
    case "spread":
      return "Spread"
    case "total":
      return "Total points"
    default:
      return `${market.player} · ${statLabel(market.statKey)}`
  }
}
