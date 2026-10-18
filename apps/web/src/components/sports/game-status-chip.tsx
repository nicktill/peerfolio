"use client"

import { formatGameStatus, type StatusInput } from "@web/lib/sports/game-status"
import type { ScoreGame } from "@web/lib/sports/scoreboard"

export const statusInputFromGame = (g: ScoreGame): StatusInput => ({
  sport: g.sport, status: g.status, statusName: g.statusName, detail: g.detail, period: g.period, clock: g.clock,
  startsAt: g.startsAt, asOf: g.fetchedAt, homeSets: g.homeSets, awaySets: g.awaySets,
})

/** Compact game status. The visible text follows the page clock; the accessible label changes at most every 30s. */
export function GameStatusChip({ input, now }: { input: StatusInput; now: number }) {
  const s = formatGameStatus(input, now)
  const label = formatGameStatus(input, Math.floor(now / 30_000) * 30_000).label
  return (
    <span className="sp-status" data-tone={s.tone} data-dim={s.dim || undefined} role="img" aria-label={label} title={s.dim && s.tone === "live" ? `${label} (last update ${Math.round((now - (typeof input.asOf === "number" ? input.asOf : Date.parse(input.asOf))) / 1000)}s ago)` : label}>
      <span aria-hidden>{s.text}{s.extra ? <small>{s.extra}</small> : null}</span>
    </span>
  )
}
