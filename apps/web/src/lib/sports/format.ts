/** Display helpers for odds and markets. Pure. */

import { americanToDecimal } from "./odds.ts"

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

export type DisplayEvent = { sport?: string; home: string; away: string }
export type DisplayMarket = {
  kind: string
  player: string | null
  statKey: string | null
  event: DisplayEvent
}
export type DisplayLine = { selection: string; point: number | null }

/** "Bills @ Chiefs" for team sports (away at home), "Alcaraz vs Sinner" for tennis. */
export const eventTitle = (event: DisplayEvent): string => (event.sport === "tennis" ? `${event.home} vs ${event.away}` : `${event.away} @ ${event.home}`)

/** The pick's name as the user reads it: "Chiefs -2.5", "Over 47.5", "Over 275.5". */
export function lineLabel(market: DisplayMarket, line: DisplayLine): { name: string; point: string } {
  const team = line.selection === "home" ? market.event.home : market.event.away
  switch (market.kind) {
    case "moneyline":
      return { name: team, point: "" }
    case "spread":
      return { name: team, point: formatPoint(line.point) }
    default:
      return { name: line.selection === "over" ? "Over" : "Under", point: `${line.point}` }
  }
}

/** The full sentence for a pick, with the player on props: "Patrick Mahomes over 275.5 passing yards". */
export function pickSentence(market: DisplayMarket, line: DisplayLine): string {
  const l = lineLabel(market, line)
  if (market.kind === "player_prop") return `${market.player} ${l.name.toLowerCase()} ${l.point} ${statLabel(market.statKey)}`
  return `${l.name} ${l.point}`.trim()
}

export function marketTitle(market: DisplayMarket): string {
  switch (market.kind) {
    case "moneyline":
      return "Winner"
    case "spread":
      return "Spread"
    case "total":
      return market.event.sport === "tennis" ? "Total games" : "Total points"
    default:
      return `${market.player} · ${statLabel(market.statKey)}`
  }
}

/** What 100 credits wins at these odds, profit only. */
export const winOn100 = (american: number): number => Math.floor(100 * americanToDecimal(american)) - 100

/** "Locks 5:20 PM", or with the day when it isn't today. */
export function lockLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay ? `Locks ${time}` : `Locks ${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`
}

/**
 * What an OPEN pick says about its game. We hold no live score, so before the start it shows when the game starts, after the
 * start "In progress", and well past any normal game length "Awaiting result". Never "Live" and never a score.
 */
export function openPickPhase(startsAt: string | Date, now: Date, locale?: string): { phase: "upcoming" | "in_progress" | "awaiting"; label: string } {
  const start = new Date(startsAt)
  const since = now.getTime() - start.getTime()
  if (since < 0) {
    const label = `Starts ${start.toLocaleString(locale, { weekday: "short", hour: "numeric", minute: "2-digit" })}`
    return { phase: "upcoming", label }
  }
  return since < 6 * 3600_000 ? { phase: "in_progress", label: "In progress" } : { phase: "awaiting", label: "Awaiting result" }
}
