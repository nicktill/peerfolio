"use client"

import { useId, useState } from "react"
import { Button } from "@web/components/ui/button"
import { useToast } from "@web/components/ui/toast"
import { mutate } from "@web/lib/use-api"
import { formatCredits, signedCredits } from "@web/lib/sports/format"

/** A server cash-out quote, as both the single-pick and the parlay endpoints return it. */
export type CashoutQuoteBody = { available: true; value: number; source: string } | { available: false; reason: string }

/**
 * The two-step sell shared by the pick and parlay Manage dialogs: the first tap asks for confirmation, the second sends the quoted
 * price. The server re-prices the sale and refuses it if the price moved against the member, in which case the quote is refetched.
 */
export function useCashOut({ url, refetch, onChanged, onClose }: { url: string; refetch: () => void; onChanged: () => void; onClose: () => void }) {
  const { toast } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [selling, setSelling] = useState(false)
  async function sell(value: number) {
    if (!confirming) { setConfirming(true); return }
    setSelling(true)
    try {
      await mutate(url, { body: { expectedValue: value } })
      toast(`Cashed out for ${formatCredits(value)}.`, "success")
      onChanged()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't cash out.", "error")
      setConfirming(false)
      refetch()
    } finally {
      setSelling(false)
    }
  }
  return { confirming, selling, sell, cancelConfirm: () => setConfirming(false) }
}

/** The Cash out section of a Manage dialog: the live value, its change against the stake, and the two-step button. */
export function CashOutCard({ quote, loading, stake, fine, disabled, confirming, selling, onSell, onCancel, unavailableNote }: {
  quote: CashoutQuoteBody | null | undefined
  loading: boolean
  stake: number
  /** The small print under the value, by price source. */
  fine: (source: string) => string
  disabled?: boolean
  confirming: boolean
  selling: boolean
  onSell: (value: number) => void
  onCancel: () => void
  unavailableNote?: string
}) {
  const id = useId()
  const q = quote && quote.available ? quote : null
  const pl = q ? q.value - stake : null
  return (
    <section className="sp-manage-card" aria-labelledby={id}>
      <h3 id={id}>Cash out</h3>
      {q ? (
        <>
          <p className="sp-manage-value numeric" aria-live="polite">
            <strong>{formatCredits(q.value)}</strong>
            {pl != null ? <span data-tone={pl > 0 ? "up" : pl < 0 ? "down" : undefined}>{signedCredits(pl)} vs stake</span> : null}
          </p>
          <p className="sp-manage-fine">{fine(q.source)}</p>
          <Button type="button" size="lg" className="sp-manage-cta" loading={selling} disabled={disabled} onClick={() => onSell(q.value)} onBlur={onCancel}>
            {confirming ? `Confirm: sell for ${formatCredits(q.value)}` : `Cash out ${formatCredits(q.value)}`}
          </Button>
        </>
      ) : (
        <p className="sp-manage-fine" role="status">{loading && !quote ? "Getting the current price…" : quote && !quote.available ? quote.reason : unavailableNote ?? "The price isn't available right now."}</p>
      )}
    </section>
  )
}
