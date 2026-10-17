"use client"

import "./sell-flourish.css"
import Image from "next/image"
import { useEffect, useState } from "react"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { formatCurrency, formatPercent } from "@web/lib/format"
import { tradeReceipt } from "@web/lib/trade-receipt"
import { cn } from "@web/lib/utils"

export type Receipt = { id: number; side: "buy" | "sell"; ticker: string; shares: number; price: number; averageCost: number | null; isNew: boolean; queued?: boolean }

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
 * restrained logo motion and order status. Tap it to dismiss, or it leaves by itself.
 */
export function TradeReceipt({ receipt, onDone }: { receipt: Receipt; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOW_MS)
    return () => clearTimeout(timer)
  }, [receipt.id, onDone])

  const { value, realized, realizedPct, outcome } = tradeReceipt(receipt)
  const buy = receipt.side === "buy"
  const headline = receipt.queued ? "Your order is queued. It fills when a live price is available." : buy ? "Position updated." : "Sale complete."

  return (
    <div
      role="status"
      onClick={onDone}
      data-side={receipt.side}
      className="fw-trade-confirmation receipt-pop absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[inherit] bg-card/95 p-5 text-center backdrop-blur-sm"
    >
      <span className="fw-trade-logo" aria-hidden>
        <svg className="fw-trade-ring" viewBox="0 0 88 88"><circle cx="44" cy="44" r="41" pathLength="1" /></svg>
        <Image src="/logo.png" alt="" width={48} height={48} className="peerfolio-logo" />
      </span>
      {receipt.side === "sell" && !receipt.queued ? (
        <span className="fw-coins" aria-hidden>
          {[-62, -38, -14, 14, 38, 62].map((x, i) => <i key={i} style={{ "--x": `${x}px`, "--d": `${0.25 + i * 0.07}s` } as React.CSSProperties} />)}
        </span>
      ) : null}
      <p className="fw-trade-confirmed relative z-10 mt-4 text-sm font-medium">{receipt.queued ? "Order queued" : "Confirmed"}</p>
      <p className="relative z-10 mt-3 font-display text-xl font-semibold tracking-tight">
        {receipt.queued ? (buy ? "Buy queued" : "Sell queued") : (buy ? "Bought" : "Sold")} <span className="font-mono">{receipt.ticker}</span>
      </p>
      {!receipt.queued ? <>
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
      </> : null}
      <p className="relative z-10 mt-2 text-sm text-muted-foreground">{headline}</p>

      <span className="receipt-timer absolute inset-x-0 bottom-0 h-1 bg-primary/40" style={{ animationDuration: `${SHOW_MS}ms` }} aria-hidden />
    </div>
  )
}
