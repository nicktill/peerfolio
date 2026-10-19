"use client"

import { PlayerBadge, TeamBadge } from "@web/components/sports/team-badge"
import { LeagueBrand } from "@web/components/sports/league-brand"
import { LiveNumber } from "@web/components/sports/live-delta"
import { formatOdds } from "@web/lib/sports/format"
import { teamLook } from "@web/lib/sports/teams"

/** A draw belongs to neither team, so it gets its own neutral gold instead of a team colour. */
export const DRAW_COLOR = "#c4a15b"

/** Both teams side by side with an equals sign between them: the mark for a Draw pick. */
export function DrawMark({ sport, away, home, size = 36 }: { sport: string; away: string; home: string; size?: number }) {
  return (
    <span className="sp-draw-mark" aria-hidden>
      <TeamBadge sport={sport} name={away} size={size} />
      <i>=</i>
      <TeamBadge sport={sport} name={home} size={size} />
    </span>
  )
}

/** The two teams, large and faded, one at each end of the card. */
export function DrawWatermarks({ sport, away, home }: { sport: string; away: string; home: string }) {
  return (
    <>
      <span className="sp-slip-watermark sp-draw-wm-a" aria-hidden><TeamBadge sport={sport} name={away} size={120} /></span>
      <span className="sp-slip-watermark sp-draw-wm-b" aria-hidden><TeamBadge sport={sport} name={home} size={120} /></span>
    </>
  )
}

/**
 * The themed selection card at the top of the pick slip: team badge and watermark, the market and pick, and the odds chip.
 * Shared by the new-pick slip and the Manage slip so they always look alike. The parent sets --tc / --tc-ink.
 */
export function SlipPickCard({ sport, side, player, mark, kicker, title, price, game, color, draw }: {
  sport: string
  /** The team this pick backs, or null (totals, props, a draw). */
  side: string | null
  player?: string | null
  /** Replaces the badge (a parlay has no single team). */
  mark?: React.ReactNode
  kicker: string
  title: string
  /** Null hides the odds chip (a parlay that is not priced yet). */
  price: number | null
  game: string
  color: string | null
  /** A Draw pick: both teams, shown together. */
  draw?: { away: string; home: string }
}) {
  const look = side ? teamLook(sport, side) : null
  return (
    <div className="sp-slip-pick">
      <div className="sp-slip-top" data-accent={color ?? undefined} data-draw={draw ? "" : undefined}>
        {side && look?.logo && sport !== "tennis" ? <span className="sp-slip-watermark" aria-hidden><TeamBadge sport={sport} name={side} size={144} /></span> : null}
        {draw && sport !== "tennis" ? <DrawWatermarks sport={sport} away={draw.away} home={draw.home} /> : null}
        {mark ? mark : draw ? <DrawMark sport={sport} away={draw.away} home={draw.home} /> : side ? <TeamBadge sport={sport} name={side} size={48} /> : player ? <PlayerBadge sport={sport} name={player} size={48} /> : <span className="sp-slip-sport"><LeagueBrand sport={sport} iconOnly /></span>}
        <div>
          <small>{kicker}</small>
          <strong>{title}</strong>
        </div>
        {price != null ? <span className="sp-slip-odds"><LiveNumber value={price} format={formatOdds} kind="price" chip={false} /></span> : null}
      </div>
      <span className="sp-slip-game">{game}</span>
    </div>
  )
}
