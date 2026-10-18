"use client"

import { useEffect, useState } from "react"
import { Check, Clock, Minus, Radio, Target, X } from "lucide-react"
import { TeamBadge } from "@web/components/sports/team-badge"
import type { ParlayLegRow } from "@web/components/sports/parlay-types"
import { useLiveGames } from "@web/components/sports/live-game"
import { eventTitle, formatOdds, marketTitle, openPickPhase, pickSentence, sideTeam } from "@web/lib/sports/format"
import { marketSelectionColor } from "@web/lib/sports/matchup-colors"

type LegState = "pending" | "live" | "won" | "lost" | "push"

const STATE: Record<LegState, { label: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", icon: <Clock aria-hidden /> },
  live: { label: "In play", icon: <Radio aria-hidden /> },
  won: { label: "Won", icon: <Check aria-hidden /> },
  lost: { label: "Lost", icon: <X aria-hidden /> },
  push: { label: "Push", icon: <Minus aria-hidden /> },
}

/**
 * The legs of a held parlay, one themed row each: team badge, the pick, game and price, and where the leg stands
 * (pending, in play with the live score, won, lost). View only; the scores come from the shared live poll.
 */
export function ParlayLegList({ legs, id, className }: { legs: ParlayLegRow[]; id?: string; className?: string }) {
  // The clock only exists in the browser, so the first paint is stable and live state follows.
  const [now, setNow] = useState<Date | null>(null)
  const anyOpen = legs.some((l) => l.status === "open")
  useEffect(() => {
    if (!anyOpen) return
    setNow(new Date())
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [anyOpen])
  const inPlay = (l: ParlayLegRow) => l.status === "open" && !!now && openPickPhase(l.event.startsAt, now).phase === "in_progress"
  const liveIds = [...new Set(legs.filter((l) => inPlay(l) && l.event.id).map((l) => l.event.id!))]
  const live = useLiveGames(liveIds, liveIds.length > 0)
  return (
    <ul className={`pl-lr-list${className ? ` ${className}` : ""}`} id={id}>
      {legs.map((leg) => {
        const market = { kind: leg.market.kind, player: null, statKey: null, event: leg.event }
        const side = sideTeam(leg.event, leg.market.kind, leg.selection)
        const color = side ? marketSelectionColor(leg.event, leg.market.kind, leg.selection) : null
        const state: LegState = leg.status === "open" ? (inPlay(leg) ? "live" : "pending") : leg.status === "void" ? "push" : leg.status
        const view = state === "live" && leg.event.id ? live.get(leg.event.id)?.view ?? null : null
        const score = view?.score && view.score.home != null && view.score.away != null ? `${view.score.away}–${view.score.home}` : null
        const phase = state === "pending" && now ? openPickPhase(leg.event.startsAt, now).label : null
        const s = STATE[state]
        return (
          <li key={leg.lineId} className="pl-lr" data-state={state} data-themed={!!color || undefined} style={color ? ({ "--tc": color } as React.CSSProperties) : undefined}>
            {side ? <TeamBadge sport={leg.event.sport} name={side} size={30} /> : <span className="sl-prop" style={{ width: 30, height: 30 }}><Target aria-hidden /></span>}
            <div className="pl-lr-body">
              <b>{pickSentence(market, leg)}</b>
              <span>{eventTitle(leg.event)} · {marketTitle(market)}</span>
            </div>
            <div className="pl-lr-end">
              <em className="numeric">{formatOdds(leg.price)}</em>
              <span className="pl-lr-state" data-state={state}>{s.icon}<span className="numeric">{state === "live" && score ? score : phase && state === "pending" && phase.length < 16 ? phase : s.label}</span></span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
