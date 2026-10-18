"use client"

import { useEffect, useRef, useState } from "react"
import { useToast } from "@web/components/ui/toast"
import { mutate } from "@web/lib/use-api"
import { formatCredits, signedCredits } from "@web/lib/sports/format"

/** A server cash-out quote, as both the single-pick and the parlay endpoints return it. */
export type CashoutQuoteBody = { available: true; value: number; source: string } | { available: false; reason: string }

/**
 * The two-step sell shared by the pick and parlay Manage slips: the first tap asks for confirmation, the second sends the quoted
 * price. The server re-prices the sale and refuses it if the price moved against the member, in which case the quote is refetched.
 */
export function useCashOut({ url, refetch, onChanged, onDone }: { url: string; refetch: () => void; onChanged: () => void; onDone: () => void }) {
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
      onDone()
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

/**
 * The Cash out block of the Manage slip, laid out like the To win row and Lock in button of a new pick: the live value (it flashes
 * when it changes, as To win does), its change against the stake, and the two-step button. A changed price drops a pending
 * confirmation so the member always confirms the number they can see.
 */
export function SlipCashOut({ quote, loading, stake, fine, disabled, confirming, selling, onSell, onCancel, unavailableNote }: {
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
  const q = quote && quote.available ? quote : null
  const value = q?.value ?? null
  const pl = value != null ? value - stake : null
  const [dir, setDir] = useState<"up" | "down" | null>(null)
  const [moved, setMoved] = useState(false)
  const prev = useRef<number | null>(null)
  useEffect(() => {
    if (value == null) return
    const before = prev.current
    prev.current = value
    if (before == null || before === value) return
    setDir(value > before ? "up" : "down")
    if (confirming) { onCancel(); setMoved(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a changed value matters
  }, [value])
  useEffect(() => { if (confirming) setMoved(false) }, [confirming])
  const repricing = !q && loading && !quote
  const reason = quote && !quote.available ? quote.reason : unavailableNote ?? "The price isn't available right now."
  return (
    <div className="sp-cashout" data-state={q ? "ready" : repricing ? "repricing" : "unavailable"}>
      <div className="sp-slip-return" aria-live="polite" data-dir={dir ?? undefined}>
        <span className="fw-label" style={{ margin: 0 }}>Cash out now</span>
        {q ? <b key={q.value} className="numeric">{formatCredits(q.value)}</b> : <span className="sp-slip-hint">{repricing ? "Getting the price…" : "Not available"}</span>}
      </div>
      {pl != null ? <p className="sp-cashout-pl numeric" data-tone={pl > 0 ? "up" : pl < 0 ? "down" : undefined}>{pl === 0 ? "Even with your stake" : `${signedCredits(pl)} vs your stake`}</p> : null}
      {moved ? <p className="sp-slip-moved" role="status" aria-live="polite">The price changed. Check the new amount, then confirm again.</p> : null}
      <button
        type="button"
        className="fw-submit"
        disabled={disabled || selling || !q}
        aria-busy={selling || repricing || undefined}
        data-updating={repricing || undefined}
        onClick={() => q && onSell(q.value)}
        onBlur={onCancel}
      >
        {selling || repricing ? <span className="spin" aria-hidden /> : null}
        {selling ? "Selling…" : repricing ? "Repricing…" : q ? (confirming ? `Confirm: sell for ${formatCredits(q.value)}` : `Cash out ${formatCredits(q.value)}`) : "Cash out unavailable"}
      </button>
      <p className="sp-fine" role="status">{q ? fine(q.source) : repricing ? "Waiting for a fresh price. Cash out turns on as soon as it is steady." : reason}</p>
    </div>
  )
}
