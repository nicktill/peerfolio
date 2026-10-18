"use client"

import { Dialog } from "@web/components/ui/dialog"
import { CashOutCard, useCashOut, type CashoutQuoteBody } from "@web/components/sports/cashout-card"
import type { ParlayRow } from "@web/components/sports/parlay-types"
import { useApi } from "@web/lib/use-api"
import { eventTitle, formatCredits, formatOdds, pickSentence } from "@web/lib/sports/format"

/**
 * Manage an open parlay: sell the whole parlay back at the current price. Cash out only, there is no adding to a parlay.
 *
 * A stacked card (identical open parlays folded into one for display) cashes out ONE underlying parlay at a time: the newest.
 * Each sale is its own real parlay with its own server quote, so a stack can never be sold as one unit that matches no row; selling
 * one leaves the rest on the card. The dialog says so.
 */
export function ParlayManager({ leagueId, parlay, onClose, onChanged }: { leagueId: string; parlay: ParlayRow; onClose: () => void; onChanged: () => void }) {
  const target = parlay.parts?.[0] ?? parlay
  const stacked = parlay.parts && parlay.parts.length > 1 ? parlay.parts.length : 0
  const url = `/api/sports/leagues/${leagueId}/parlays/${target.id}/cashout`
  const { data: quote, loading, refetch } = useApi<CashoutQuoteBody>(url, [target.id], { refreshMs: 4000 })
  const { confirming, selling, sell, cancelConfirm } = useCashOut({ url, refetch, onChanged, onClose })
  return (
    <Dialog open onClose={onClose} title="Your parlay" description={`${target.legs.length}-leg parlay`} className="sp-manage">
      <div className="sp-manage-body">
        <div className="sp-manage-pick">
          <b>{target.legs.length}-leg parlay</b>
          <ul className="sp-manage-legs">
            {target.legs.map((leg) => {
              const market = { kind: leg.market.kind, player: null, statKey: null, event: leg.event }
              return (
                <li key={leg.lineId} data-status={leg.status}>
                  <span>{pickSentence(market, leg)}</span>
                  <small>{eventTitle(leg.event)} · {formatOdds(leg.price)}{leg.status !== "open" ? ` · ${leg.status === "won" ? "Won" : leg.status === "lost" ? "Lost" : "Push"}` : ""}</small>
                </li>
              )
            })}
          </ul>
          <dl className="sl-tk-money numeric">
            <div className="sl-tk-fig"><dt>Stake</dt><dd>{formatCredits(target.stake)}</dd></div>
            <div className="sl-tk-fig" data-tone="up"><dt>To win</dt><dd>{formatCredits(Math.max(0, target.totalReturn - target.stake))}</dd></div>
            <div className="sl-tk-fig" data-tone="muted"><dt>Odds</dt><dd>{formatOdds(target.price)}</dd></div>
          </dl>
        </div>
        {stacked ? <p className="sp-manage-fine" role="note">This card stacks {stacked} identical parlays. Cashing out sells one of them (your newest, stake {formatCredits(target.stake)}); the rest stay open.</p> : null}
        <CashOutCard
          quote={quote}
          loading={loading}
          stake={target.stake}
          fine={(source) =>
            `${source === "live" ? "Live price from the market" : source === "mixed" ? "Live price for games in play, line prices for the rest" : "Current line prices"}, updated every few seconds. A small fee applies once. Selling ends the whole parlay.`}
          disabled={selling}
          confirming={confirming}
          selling={selling}
          onSell={(value) => void sell(value)}
          onCancel={cancelConfirm}
          unavailableNote="Cash-out isn't available for this parlay right now."
        />
      </div>
    </Dialog>
  )
}
