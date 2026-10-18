"use client"

import { useId, useState } from "react"
import { X } from "lucide-react"
import { useToast } from "@web/components/ui/toast"
import { SheetHandle } from "@web/components/sports/sheet-handle"
import { SlipPickCard } from "@web/components/sports/slip-pick-card"
import { SlipCashOut, useCashOut, type CashoutQuoteBody } from "@web/components/sports/cashout-card"
import { TicketFig, TicketMoney } from "@web/components/sports/ticket-figures"
import type { PickRow } from "@web/components/sports/league-parts"
import type { ParlayRow } from "@web/components/sports/parlay-types"
import { ParlayLegList } from "@web/components/sports/parlay-legs"
import { LegStack } from "@web/components/sports/parlay-ticket"
import { mutate, useApi } from "@web/lib/use-api"
import { americanToDecimal } from "@web/lib/sports/odds"
import { eventTitle, formatCredits, formatOdds, marketTitle, pickSentence, sideTeam } from "@web/lib/sports/format"
import { marketSelectionColor } from "@web/lib/sports/matchup-colors"
import { onColor } from "@web/lib/sports/teams"

/** What the pick slip is managing: an open pick or an open parlay (possibly a stacked card). */
export type ManageTarget = { kind: "pick"; pick: PickRow } | { kind: "parlay"; parlay: ParlayRow }

type PickQuote = CashoutQuoteBody & { add?: { lineId: string; price: number; point: number | null } }
type Limits = { minStake: number; maxStake: number }

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
const NEUTRAL = "#64748b"

/**
 * The pick slip in Manage mode: the same themed slip a new pick uses, showing a pick you hold. Sell it back at the current price,
 * or (a single, before kickoff) add more at the current line. Prices are server quotes refreshed every few seconds; the sale is
 * re-priced on the server and refused if it moved against you.
 */
export function ManageSlip({ leagueId, target, balance, limits, onClear, onMinimize, onChanged }: {
  leagueId: string
  target: ManageTarget
  balance: number
  limits: Limits
  /** Leave Manage mode (Clear, or after a sale or add). */
  onClear: () => void
  onMinimize: () => void
  onChanged: () => void
}) {
  return target.kind === "pick"
    ? <PickManage key={target.pick.id} leagueId={leagueId} pick={target.pick} balance={balance} limits={limits} onClear={onClear} onMinimize={onMinimize} onChanged={onChanged} />
    : <ParlayManage key={(target.parlay.parts?.[0] ?? target.parlay).id} leagueId={leagueId} parlay={target.parlay} onClear={onClear} onMinimize={onMinimize} onChanged={onChanged} />
}

function Shell({ color, title, busy, onClear, onMinimize, children }: { color: string; title: string; busy: boolean; onClear: () => void; onMinimize: () => void; children: React.ReactNode }) {
  const id = useId()
  return (
    <section className="fw-panel fw-trade sp-slip sp-sheet sp-manage-slip" data-open="" data-themed="" data-managing="" style={{ "--tc": color, "--tc-ink": onColor(color) } as React.CSSProperties} aria-labelledby={id} aria-busy={busy || undefined}>
      <SheetHandle onMinimize={onMinimize} disabled={busy} />
      <div className="fw-section-head">
        <h2 id={id}>{title}</h2>
        <button type="button" className="sp-clear" onClick={onClear} disabled={busy} aria-label="Close and clear the slip"><X aria-hidden /> Clear</button>
      </div>
      <div className="sp-manage-form">{children}</div>
    </section>
  )
}

function PickManage({ leagueId, pick, balance, limits, onClear, onMinimize, onChanged }: { leagueId: string; pick: PickRow; balance: number; limits: Limits; onClear: () => void; onMinimize: () => void; onChanged: () => void }) {
  const { toast } = useToast()
  const url = `/api/sports/leagues/${leagueId}/picks/${pick.id}/cashout`
  const { data: quote, loading, refetch } = useApi<PickQuote>(url, [pick.id], { refreshMs: 4000 })
  const [stake, setStake] = useState("")
  const [adding, setAdding] = useState(false)
  const [addKey, setAddKey] = useState(newKey)
  const { confirming, selling, sell, cancelConfirm } = useCashOut({ url, refetch, onChanged, onDone: onClear })
  const stakeId = useId()
  const hintId = useId()
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, "")) || 0)
  const add = quote && quote.available ? quote.add ?? null : null
  const addWin = add && amount > 0 ? Math.floor(amount * americanToDecimal(add.price)) - amount : null
  const cap = Math.min(limits.maxStake, balance)
  const problem = amount === 0 ? null : amount < limits.minStake ? `Minimum is ${formatCredits(limits.minStake)}` : amount > limits.maxStake ? `Maximum per pick is ${formatCredits(limits.maxStake)}` : amount > balance ? "Not enough cash" : null

  const market = { kind: pick.market.kind, player: pick.market.player, statKey: pick.market.statKey, event: pick.event }
  const color = marketSelectionColor(pick.event, pick.market.kind, pick.selection) ?? NEUTRAL
  const live = quote && quote.available && quote.source === "live"

  async function addMore(event: React.FormEvent) {
    event.preventDefault()
    if (!add || amount <= 0 || problem) return
    setAdding(true)
    try {
      await mutate(`/api/sports/leagues/${leagueId}/picks`, { body: { lineId: add.lineId, stake: amount, expectedPrice: add.price, expectedPoint: add.point, requestId: addKey } })
      toast(`Added ${formatCredits(amount)} to your pick.`, "success")
      setStake("")
      setAddKey(newKey())
      onChanged()
      onClear()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add to that pick.", "error")
      refetch()
    } finally {
      setAdding(false)
    }
  }

  return (
    <Shell color={color} title="Your pick" busy={selling || adding} onClear={onClear} onMinimize={onMinimize}>
      <SlipPickCard sport={pick.event.sport} side={sideTeam(pick.event, pick.market.kind, pick.selection)} player={pick.market.player} kicker={marketTitle(market)} title={pickSentence(market, pick)} price={pick.price} game={`${eventTitle(pick.event)} · you hold this at ${formatOdds(pick.price)}`} color={color} />
      <TicketMoney>
        <TicketFig label="Stake">{formatCredits(pick.stake)}</TicketFig>
        <TicketFig label="To win" tone="up">{formatCredits(Math.max(0, pick.totalReturn - pick.stake))}</TicketFig>
        <TicketFig label="Odds" tone="muted">{formatOdds(pick.price)}</TicketFig>
      </TicketMoney>
      <SlipCashOut
        quote={quote}
        loading={loading}
        stake={pick.stake}
        fine={() => `${live ? "Live price from the market" : "Current line price"}, updated every few seconds. Selling ends this pick.`}
        disabled={adding}
        confirming={confirming}
        selling={selling}
        onSell={(value) => void sell(value)}
        onCancel={cancelConfirm}
      />
      {add ? (
        <form className="sp-manage-add" onSubmit={addMore} aria-label="Add more to this pick">
          <h3>Add more <small>at {formatOdds(add.price)} now</small></h3>
          <div>
            <label className="fw-label" htmlFor={stakeId}>Extra stake (play cash)</label>
            <input id={stakeId} className="fw-input numeric" inputMode="numeric" autoComplete="off" placeholder={`${formatCredits(limits.minStake)} to ${formatCredits(limits.maxStake)}`} value={stake} onChange={(e) => setStake(e.target.value)} aria-describedby={hintId} aria-invalid={problem ? true : undefined} disabled={selling} />
            <p className="fw-hint" id={hintId} role={problem ? "alert" : undefined}>{problem ? <span className="fw-bad">{problem}</span> : <span>Your pick becomes one combined pick at blended odds.</span>}</p>
          </div>
          <div className="fw-quick">
            {[limits.minStake, Math.round(cap / 4), Math.round(cap / 2), cap].map((v, i) => (
              <button key={i} type="button" disabled={v < limits.minStake || selling} aria-label={i === 3 ? `Add the maximum, ${formatCredits(cap)} cash` : `Add ${formatCredits(v)} cash`} onClick={() => setStake(String(Math.max(v, limits.minStake)))}>{i === 3 ? "Max" : formatCredits(v)}</button>
            ))}
          </div>
          <div className="sp-slip-return" aria-live="polite">
            <span className="fw-label" style={{ margin: 0 }}>To win (extra)</span>
            {addWin != null && !problem ? <b key={add.price}>{formatCredits(addWin)}</b> : <span className="sp-slip-hint">Enter a stake</span>}
          </div>
          <button type="submit" className="fw-btn sp-manage-addbtn" disabled={adding || selling || amount <= 0 || !!problem} aria-busy={adding || undefined}>
            {adding ? <span className="spin" aria-hidden /> : null}
            {adding ? "Adding…" : `Add ${amount > 0 ? formatCredits(amount) : "more"}`}
          </button>
        </form>
      ) : null}
    </Shell>
  )
}

function ParlayManage({ leagueId, parlay, onClear, onMinimize, onChanged }: { leagueId: string; parlay: ParlayRow; onClear: () => void; onMinimize: () => void; onChanged: () => void }) {
  // A stacked card (identical open parlays folded into one for display) cashes out ONE underlying parlay at a time: the newest.
  const target = parlay.parts?.[0] ?? parlay
  const stacked = parlay.parts && parlay.parts.length > 1 ? parlay.parts.length : 0
  const url = `/api/sports/leagues/${leagueId}/parlays/${target.id}/cashout`
  const { data: quote, loading, refetch } = useApi<CashoutQuoteBody>(url, [target.id], { refreshMs: 4000 })
  const { confirming, selling, sell, cancelConfirm } = useCashOut({ url, refetch, onChanged, onDone: onClear })
  const first = target.legs[0]
  return (
    <Shell color={NEUTRAL} title="Your parlay" busy={selling} onClear={onClear} onMinimize={onMinimize}>
      <SlipPickCard sport={first?.event.sport ?? ""} side={null} mark={<LegStack legs={target.legs} />} kicker="Parlay" title={`${target.legs.length}-leg parlay`} price={target.price} game={`Combined odds you hold: ${formatOdds(target.price)}`} color={NEUTRAL} />
      <ParlayLegList legs={target.legs} />
      <TicketMoney label="Parlay money">
        <TicketFig label="Stake">{formatCredits(target.stake)}</TicketFig>
        <TicketFig label="To win" tone="up">{formatCredits(Math.max(0, target.totalReturn - target.stake))}</TicketFig>
        <TicketFig label="Odds" tone="muted">{formatOdds(target.price)}</TicketFig>
      </TicketMoney>
      {stacked ? <p className="sp-fine" role="note">This card stacks {stacked} identical parlays. Cashing out sells one of them (your newest, stake {formatCredits(target.stake)}); the rest stay open.</p> : null}
      <SlipCashOut
        quote={quote}
        loading={loading}
        stake={target.stake}
        fine={(source) => `${source === "live" ? "Live price from the market" : source === "mixed" ? "Live price for games in play, line prices for the rest" : "Current line prices"}, updated every few seconds. Selling ends the whole parlay.`}
        disabled={false}
        confirming={confirming}
        selling={selling}
        onSell={(value) => void sell(value)}
        onCancel={cancelConfirm}
        unavailableNote="Cash-out isn't available for this parlay right now."
      />
    </Shell>
  )
}
