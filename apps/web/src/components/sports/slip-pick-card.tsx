"use client"

import { PlayerBadge, TeamBadge } from "@web/components/sports/team-badge"
import { LiveNumber } from "@web/components/sports/live-delta"
import { formatOdds, SPORT_LABEL } from "@web/lib/sports/format"
import { teamLook } from "@web/lib/sports/teams"

/**
 * The themed selection card at the top of the pick slip: team badge and watermark, the market and pick, and the odds chip.
 * Shared by the new-pick slip and the Manage slip so they always look alike. The parent sets --tc / --tc-ink.
 */
export function SlipPickCard({ sport, side, player, mark, kicker, title, price, game, color }: {
  sport: string
  /** The team this pick backs, or null (totals, props). */
  side: string | null
  player?: string | null
  /** Replaces the badge (a parlay has no single team). */
  mark?: React.ReactNode
  kicker: string
  title: string
  price: number
  game: string
  color: string | null
}) {
  const look = side ? teamLook(sport, side) : null
  return (
    <div className="sp-slip-pick">
      <div className="sp-slip-top" data-accent={color ?? undefined}>
        {side && look?.logo && sport !== "tennis" ? <span className="sp-slip-watermark" aria-hidden><TeamBadge sport={sport} name={side} size={144} /></span> : null}
        {mark ? mark : side ? <TeamBadge sport={sport} name={side} size={48} /> : player ? <PlayerBadge sport={sport} name={player} size={48} /> : <span className="sp-slip-sport">{SPORT_LABEL[sport] ?? ""}</span>}
        <div>
          <small>{kicker}</small>
          <strong>{title}</strong>
        </div>
        <span className="sp-slip-odds"><LiveNumber value={price} format={formatOdds} kind="price" chip={false} /></span>
      </div>
      <span className="sp-slip-game">{game}</span>
    </div>
  )
}
