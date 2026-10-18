"use client"

import "./parlay.css"
import { useEffect, useState } from "react"
import { Check, ChevronDown, Clock, Minus, Target, Undo2, X } from "lucide-react"
import { TeamBadge } from "@web/components/sports/team-badge"
import type { ParlayLegRow, ParlayRow } from "@web/components/sports/parlay-types"
import { TicketFig, TicketMoney } from "@web/components/sports/ticket-figures"
import { marketSelectionColor } from "@web/lib/sports/matchup-colors"
import { eventTitle, formatCredits, formatOdds, marketTitle, openPickPhase, pickSentence, sideTeam, signedCredits } from "@web/lib/sports/format"

const STATUS: Record<string, { label: string; icon: React.ReactNode }> = {
  open: { label: "Open", icon: <Clock aria-hidden /> },
  won: { label: "Won", icon: <Check aria-hidden /> },
  lost: { label: "Lost", icon: <X aria-hidden /> },
  push: { label: "Push", icon: <Minus aria-hidden /> },
  void: { label: "Refunded", icon: <Undo2 aria-hidden /> },
}

const toWin = (p: ParlayRow) => Math.max(0, p.totalReturn - p.stake)

function LegRow({ leg, now }: { leg: ParlayLegRow; now: Date | null }) {
  const market = { kind: leg.market.kind, player: null, statKey: null, event: leg.event }
  const side = sideTeam(leg.event, leg.market.kind, leg.selection)
  const phase = leg.status === "open" && now ? openPickPhase(leg.event.startsAt, now) : null
  const s = STATUS[leg.status] ?? STATUS.open!
  return (
    <li className="pl-ticket-leg" data-status={leg.status}>
      {side ? <TeamBadge sport={leg.event.sport} name={side} size={28} /> : <span className="sl-prop" style={{ width: 28, height: 28 }}><Target aria-hidden /></span>}
      <div>
        <b>{pickSentence(market, leg)}</b>
        <span>{eventTitle(leg.event)} · {marketTitle(market)} · <em>{formatOdds(leg.price)}</em></span>
        {phase ? <span>{phase.label}</span> : null}
      </div>
      <span className="sl-chip" data-status={leg.status}>{s.icon}{s.label}</span>
    </li>
  )
}

/** The teams in a parlay as closely stacked discs, each tinted by its side and ringed by how that leg is going. */
function LegStack({ legs }: { legs: ParlayLegRow[] }) {
  const shown = legs.slice(0, 3)
  const more = legs.length - shown.length
  return (
    <span className="pl-stack" aria-hidden>
      {shown.map((leg, i) => {
        const side = sideTeam(leg.event, leg.market.kind, leg.selection)
        const color = side ? marketSelectionColor(leg.event, leg.market.kind, leg.selection) : undefined
        return (
          <span key={leg.lineId} className="pl-stack-disc" data-status={leg.status} style={{ zIndex: shown.length - i, ...(color ? ({ "--disc": color } as React.CSSProperties) : null) }}>
            {side ? <TeamBadge sport={leg.event.sport} name={side} size={22} /> : <Target />}
          </span>
        )
      })}
      {more > 0 ? <span className="pl-stack-disc pl-stack-more">+{more}</span> : null}
    </span>
  )
}

/** A parlay as a ticket: combined odds, risk and to win, an overall result, and the legs with their own results. */
export function ParlayTicket({ parlay, showName }: { parlay: ParlayRow; showName?: boolean }) {
  const [open, setOpen] = useState(false)
  // The clock only exists in the browser, so the first paint is stable and live status follows.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (parlay.status !== "open") return
    setNow(new Date())
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [parlay.status])
  const s = STATUS[parlay.status] ?? STATUS.open!
  const net = parlay.payout == null ? null : parlay.payout - parlay.stake
  const wonLegs = parlay.legs.filter((l) => l.status === "won").length
  const openLegs = parlay.legs.filter((l) => l.status === "open").length
  const progress = parlay.status === "open" ? `${wonLegs} of ${parlay.legs.length} won${openLegs ? `, ${openLegs} to play` : ""}` : parlay.status === "void" ? "All legs void, stake refunded" : null
  const listId = `pl-legs-${parlay.id}`
  const netTone = net != null ? (net > 0 ? "up" : net < 0 ? "down" : undefined) : undefined
  return (
    <li className="pl-ticket" data-status={parlay.status}>
      <div className="sl-tk-head">
        <LegStack legs={parlay.legs} />
        <div className="sl-tk-title">
          <b>{parlay.legs.length}-leg parlay{parlay.stacked && parlay.stacked > 1 ? ` ×${parlay.stacked}` : ""}</b>
          <span className="sl-tk-meta">{showName && parlay.name ? <em>{parlay.name.split(" ")[0]}{parlay.you ? " (You)" : ""} · </em> : null}{progress ?? `${wonLegs} of ${parlay.legs.length} legs won`}</span>
        </div>
        <span className="sl-chip" data-status={parlay.status}>{s.icon}{s.label}</span>
      </div>
      <TicketMoney label="Parlay money">
        <TicketFig label="Stake">{formatCredits(parlay.stake)}</TicketFig>
        {parlay.payout == null ? <TicketFig label="To win" tone="up">{formatCredits(toWin(parlay))}</TicketFig> : parlay.payout > 0 ? <TicketFig label="Paid" tone="up">{formatCredits(parlay.payout)}</TicketFig> : <TicketFig label="Payout" tone="down">None</TicketFig>}
        {parlay.status === "open" || net == null ? (
          <TicketFig label="Odds" tone="muted" title="Combined odds you locked in">{formatOdds(parlay.price)}</TicketFig>
        ) : (
          <TicketFig label="Net" tone={netTone} big>
            <span aria-hidden className="sl-tk-arrow">{net > 0 ? "▲" : net < 0 ? "▼" : ""}</span>{signedCredits(net)}
          </TicketFig>
        )}
      </TicketMoney>
      <button type="button" className="pl-expand" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <span>{open ? "Hide legs" : `Show ${parlay.legs.length} legs`}</span>
        <ChevronDown aria-hidden />
      </button>
      {open ? <ul className="pl-ticket-legs" id={listId}>{parlay.legs.map((l) => <LegRow key={l.lineId} leg={l} now={now} />)}</ul> : null}
    </li>
  )
}
