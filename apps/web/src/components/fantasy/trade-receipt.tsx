"use client"

import { useEffect, useState } from "react"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { formatCurrency, formatPercent } from "@web/lib/format"
import { tradeReceipt } from "@web/lib/trade-receipt"
import { cn } from "@web/lib/utils"

export type Receipt = { id: number; side: "buy" | "sell"; ticker: string; shares: number; price: number; averageCost: number | null; isNew: boolean }

/** How long a receipt stays up on its own. The timer bar under it runs for exactly this long. */
const SHOW_MS = 3600

const fmtShares = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`

/** The dollar figure counts up from zero instead of just appearing. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value))
    return () => cancelAnimationFrame(id)
  }, [value])
  return <AnimatedNumber value={shown} format={formatCurrency} durationMs={900} />
}

/**
 * The moment a trade goes through: a receipt that pops over the panel with its
 * own little scene. A buy lifts off, a winning sale rains money, a losing one
 * just says so and lets you move on. Tap it to dismiss, or it leaves by itself.
 */
export function TradeReceipt({ receipt, onDone }: { receipt: Receipt; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOW_MS)
    return () => clearTimeout(timer)
  }, [receipt.id, onDone])

  const { value, realized, realizedPct, outcome } = tradeReceipt(receipt)
  const buy = receipt.side === "buy"
  const emoji = buy ? "🚀" : outcome === "loss" ? "🩹" : "💸"
  const headline = buy ? (receipt.isNew ? "You're in." : "Added to your stack.") : outcome === "win" ? "Banked. 🔒" : outcome === "loss" ? "Cut it. Live to trade again." : "Clean exit."

  return (
    <div
      role="status"
      onClick={onDone}
      className="receipt-pop absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[inherit] bg-card/95 p-5 text-center backdrop-blur-sm"
    >
      {outcome === "win" ? <Rain /> : null}
      <span className="float-y relative z-10 text-5xl" aria-hidden>
        <span key={receipt.id} className="emoji-pop inline-block">
          {emoji}
        </span>
      </span>
      <p className="relative z-10 mt-3 font-display text-xl font-semibold tracking-tight">
        {buy ? "Bought" : "Sold"} <span className="font-mono">{receipt.ticker}</span>
      </p>
      <p className="numeric relative z-10 mt-1 text-3xl font-semibold">
        <CountUp value={value} />
      </p>
      <p className="numeric relative z-10 mt-1 text-xs text-muted-foreground">
        {fmtShares(receipt.shares)} sh @ {formatCurrency(receipt.price)}
      </p>

      {realized !== null && realizedPct !== null ? (
        <p className={cn("numeric relative z-10 mt-3 rounded-full px-3 py-1 text-sm font-semibold", outcome === "win" ? "text-gain-ink tint-gain" : outcome === "loss" ? "text-loss-ink tint-loss" : "bg-muted text-muted-foreground")}>
          {outcome === "flat" ? "Broke even" : `${signed(realized)} (${formatPercent(realizedPct)}) locked in`}
        </p>
      ) : null}
      <p className="relative z-10 mt-2 text-sm text-muted-foreground">{headline}</p>

      <span className="receipt-timer absolute inset-x-0 bottom-0 h-1 bg-primary/40" style={{ animationDuration: `${SHOW_MS}ms` }} aria-hidden />
    </div>
  )
}

/** Money falling down the card, for a sale that made money. Still when motion is reduced. */
function Rain() {
  const pieces = ["💸", "🪙", "💰", "💸", "🪙", "💵", "💰", "🪙", "💸", "💵"]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0 motion-reduce:hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="rain absolute text-lg"
          style={{ left: `${6 + i * 9.5}%`, animationDelay: `${(i % 5) * 110}ms`, animationDuration: `${1300 + (i % 4) * 220}ms` }}
        >
          {p}
        </span>
      ))}
    </div>
  )
}
