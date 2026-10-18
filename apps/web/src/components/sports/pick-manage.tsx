"use client"

import { useId, useState } from "react"
import { Button } from "@web/components/ui/button"
import { Dialog } from "@web/components/ui/dialog"
import { useToast } from "@web/components/ui/toast"
import { mutate, useApi } from "@web/lib/use-api"
import { americanToDecimal } from "@web/lib/sports/odds"
import { formatCredits, formatOdds, pickSentence, eventTitle, marketTitle, signedCredits } from "@web/lib/sports/format"
import type { PickRow } from "@web/components/sports/league-parts"

type Quote =
  | { available: true; value: number; source: "pregame" | "live"; stake: number; totalReturn: number; add?: { lineId: string; price: number; point: number | null } }
  | { available: false; reason: string; add?: { lineId: string; price: number; point: number | null } }

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
  const [busy, setBusy] = useState<"sell" | "add" | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [addKey, setAddKey] = useState(newKey)
  const stakeId = useId()
  const amount = Math.floor(Number(stake.replace(/[^\d]/g, "")) || 0)
  const q = quote && quote.available ? quote : null
  const add = quote?.add ?? null
  const pl = q ? q.value - pick.stake : null
  const addWin = add && amount > 0 ? Math.floor(amount * americanToDecimal(add.price)) - amount : null

  async function sell() {
    if (!q) return
    if (!confirming) { setConfirming(true); return }
    setBusy("sell")
    try {
      await mutate(url, { body: { expectedValue: q.value } })
      toast(`Cashed out for ${formatCredits(q.value)}.`, "success")
      onChanged()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't cash out.", "error")
      setConfirming(false)
      refetch()
    } finally {
      setBusy(null)
    }
  }

  async function addMore(event: React.FormEvent) {
    event.preventDefault()
    if (!add || amount <= 0) return
    setBusy("add")
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
      setBusy(null)
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

        <section className="sp-manage-card" aria-labelledby={`${stakeId}-sell`}>
          <h3 id={`${stakeId}-sell`}>Cash out</h3>
          {q ? (
            <>
              <p className="sp-manage-value numeric" aria-live="polite">
                <strong>{formatCredits(q.value)}</strong>
                {pl != null ? <span data-tone={pl > 0 ? "up" : pl < 0 ? "down" : undefined}>{signedCredits(pl)} vs stake</span> : null}
              </p>
              <p className="sp-manage-fine">{q.source === "live" ? "Live price from the market, updated every few seconds." : "Current line price, updated every few seconds."} A small fee applies. Selling ends this pick.</p>
              <Button type="button" size="lg" className="sp-manage-cta" loading={busy === "sell"} disabled={busy != null} onClick={sell} onBlur={() => setConfirming(false)}>
                {confirming ? `Confirm: sell for ${formatCredits(q.value)}` : `Cash out ${formatCredits(q.value)}`}
              </Button>
            </>
          ) : (
            <p className="sp-manage-fine" role="status">{loading && !quote ? "Getting the current price…" : quote && !quote.available ? quote.reason : "The price isn't available right now."}</p>
          )}
        </section>

        {add ? (
          <form className="sp-manage-card" onSubmit={addMore} aria-labelledby={`${stakeId}-add`}>
            <h3 id={`${stakeId}-add`}>Add more <small>at {formatOdds(add.price)} now</small></h3>
            <label className="sr-only" htmlFor={stakeId}>Extra stake</label>
            <input id={stakeId} className="fw-input numeric" inputMode="numeric" autoComplete="off" placeholder="Extra stake" value={stake} onChange={(e) => setStake(e.target.value)} />
            <p className="sp-manage-fine">{addWin != null ? `Adds ${formatCredits(addWin)} to win. Your pick becomes one combined pick at blended odds.` : "Adds to this same pick; the odds blend with what you already have."}</p>
            <Button type="submit" size="lg" variant="outline" className="sp-manage-cta" loading={busy === "add"} disabled={busy != null || amount <= 0}>Add {amount > 0 ? formatCredits(amount) : "more"}</Button>
          </form>
        ) : null}
      </div>
    </Dialog>
  )
}
