"use client"

import { useId, useState } from "react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { CashOutCard, useCashOut, type CashoutQuoteBody } from "@web/components/sports/cashout-card"
import { mutate, useApi } from "@web/lib/use-api"
import { americanToDecimal } from "@web/lib/sports/odds"
import { formatCredits, formatOdds, pickSentence, eventTitle, marketTitle } from "@web/lib/sports/format"
import type { PickRow } from "@web/components/sports/league-parts"

type Quote = CashoutQuoteBody & { add?: { lineId: string; price: number; point: number | null } }

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

/**
 * Manage an open pick: sell it back at the current price, or (before kickoff) add more at the current line.
 * The cash-out price is a server quote that refreshes every few seconds; the sale is re-priced on the server and refused if it moved against you.
 */
export function PickManager({ leagueId, pick, onClose, onChanged }: { leagueId: string; pick: PickRow; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast()
  const url = `/api/sports/leagues/${leagueId}/picks/${pick.id}/cashout`
  const { data: quote, loading, refetch } = useApi<Quote>(url, [pick.id], { refreshMs: 4000 })
  const [stake, setStake] = useState("")
  const [adding, setAdding] = useState(false)
  const { confirming, selling, sell, cancelConfirm } = useCashOut({ url, refetch, onChanged, onClose })
  const [addKey, setAddKey] = useState(newKey)
  const stakeId = useId()
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, "")) || 0)
  const add = quote?.add ?? null
  const addWin = add && amount > 0 ? Math.floor(amount * americanToDecimal(add.price)) - amount : null

  async function addMore(event: React.FormEvent) {
    event.preventDefault()
    if (!add || amount <= 0) return
    setAdding(true)
    try {
      await mutate(`/api/sports/leagues/${leagueId}/picks`, { body: { lineId: add.lineId, stake: amount, expectedPrice: add.price, expectedPoint: add.point, requestId: addKey } })
      toast(`Added ${formatCredits(amount)} to your pick.`, "success")
      setStake("")
      setAddKey(newKey())
      onChanged()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add to that pick.", "error")
      refetch()
    } finally {
      setAdding(false)
    }
  }

  const market = { kind: pick.market.kind, player: pick.market.player, statKey: pick.market.statKey, event: pick.event }
  return (
    <Dialog open onClose={onClose} title="Your pick" description={`${eventTitle(pick.event)} · ${marketTitle(market)}`} className="sp-manage">
      <div className="sp-manage-body">
        <div className="sp-manage-pick">
          <b>{pickSentence(market, pick)}</b>
          <dl className="sl-tk-money numeric">
            <div className="sl-tk-fig"><dt>Stake</dt><dd>{formatCredits(pick.stake)}</dd></div>
            <div className="sl-tk-fig" data-tone="up"><dt>To win</dt><dd>{formatCredits(Math.max(0, pick.totalReturn - pick.stake))}</dd></div>
            <div className="sl-tk-fig" data-tone="muted"><dt>Odds</dt><dd>{formatOdds(pick.price)}</dd></div>
          </dl>
        </div>

        <CashOutCard
          quote={quote}
          loading={loading}
          stake={pick.stake}
          fine={(source) => `${source === "live" ? "Live price from the market, updated every few seconds." : "Current line price, updated every few seconds."} A small fee applies. Selling ends this pick.`}
          disabled={adding || selling}
          confirming={confirming}
          selling={selling}
          onSell={(value) => void sell(value)}
          onCancel={cancelConfirm}
        />

        {add ? (
          <form className="sp-manage-card" onSubmit={addMore} aria-labelledby={`${stakeId}-add`}>
            <h3 id={`${stakeId}-add`}>Add more <small>at {formatOdds(add.price)} now</small></h3>
            <label className="sr-only" htmlFor={stakeId}>Extra stake</label>
            <input id={stakeId} className="fw-input numeric" inputMode="numeric" autoComplete="off" placeholder="Extra stake" value={stake} onChange={(e) => setStake(e.target.value)} />
            <p className="sp-manage-fine">{addWin != null ? `Adds ${formatCredits(addWin)} to win. Your pick becomes one combined pick at blended odds.` : "Adds to this same pick; the odds blend with what you already have."}</p>
            <Button type="submit" size="lg" variant="outline" className="sp-manage-cta" loading={adding} disabled={adding || selling || amount <= 0}>Add {amount > 0 ? formatCredits(amount) : "more"}</Button>
          </form>
        ) : null}
      </div>
    </Dialog>
  )
}
