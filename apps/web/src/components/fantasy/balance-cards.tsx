"use client"

import { useEffect, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Coins, Minus, Wallet, Briefcase } from "lucide-react"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { cn } from "@web/lib/utils"
import { TiltCard } from "@web/components/ui/tilt-card"
import { formatCurrency } from "@web/lib/format"
import { cashSplit } from "@web/lib/fantasy-rules"

/** Whole cents, so a fill's rounding noise never reads as a gain or a loss. */
const cents = (n: number) => Math.round(n * 100) / 100

/** Sign is spelled out (not just colour) so direction survives colour-blindness. */
const signedCurrency = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`

/**
 * A light sweep across the card. Re-keyed on every change of `watch`, so it
 * plays when the card arrives and again whenever the number moves.
 */
function Sheen({ watch }: { watch: number }) {
  return <span key={Math.round(watch)} className="stat-sheen" aria-hidden />
}

function IconChip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-lg [&>svg]:size-3.5", className)} aria-hidden>
      {children}
    </span>
  )
}

/** Everything you're worth, and how much of it is out working versus sitting on the bench. */
export function PortfolioStat({ value, cash, startingCash }: { value: number; cash: number; startingCash: number }) {
  const profit = cents(value - startingCash)
  const { cashPct, investedPct } = cashSplit(value, cash)
  const direction = profit > 0 ? "up" : profit < 0 ? "down" : "flat"
  const Arrow = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus

  // Bars start empty and fill once mounted, so they grow in instead of appearing.
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <TiltCard
      className={cn(
        "stat-card relative overflow-hidden rounded-2xl border p-3 backdrop-blur",
        direction === "up" && "stat-card-up",
        direction === "down" && "stat-card-down",
        direction === "flat" && "bg-background/70",
      )}
    >
      <Sheen watch={value} />
      <dt className="relative flex items-center gap-2 text-xs text-muted-foreground">
        <IconChip className="bg-primary/15 text-primary">
          <Briefcase />
        </IconChip>
        Portfolio value
      </dt>
      <dd className="relative mt-1.5">
        <AnimatedNumber className="numeric block text-xl font-semibold" value={value} format={formatCurrency} countUp="fantasy-value" />
        <span
          className={cn(
            "numeric mt-0.5 flex items-center gap-1 text-xs font-medium",
            direction === "up" && "text-gain-ink",
            direction === "down" && "text-loss-ink",
            direction === "flat" && "text-muted-foreground",
          )}
        >
          <Arrow className="size-3 shrink-0" aria-hidden />
          {direction === "flat" ? "Even with the start" : `${signedCurrency(profit)} since the start`}
        </span>

        <span className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className="stat-bar h-full bg-primary"
            style={{ width: filled ? `${investedPct}%` : "0%" }}
          />
          <span
            className="stat-bar h-full bg-[var(--series-4)]"
            style={{ width: filled ? `${cashPct}%` : "0%" }}
          />
        </span>
        <span className="numeric mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            {Math.round(investedPct)}% picks
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-[var(--series-4)]" aria-hidden />
            {Math.round(cashPct)}% cash
          </span>
        </span>
      </dd>
    </TiltCard>
  )
}

/** Spendable cash, in the warm colour the split bar uses for it. */
export function CashStat({ cash, value }: { cash: number; value: number }) {
  const { cashPct } = cashSplit(value, cash)
  const hasCash = cash >= 0.01

  return (
    <TiltCard className={cn("stat-card stat-card-cash relative overflow-hidden rounded-2xl border p-3 backdrop-blur", hasCash && "stat-card-cash-live")}>
      <Sheen watch={cash} />
      <Coins
        className="pointer-events-none absolute -bottom-3 -right-2 size-20 -rotate-12 text-[var(--series-4)] opacity-[0.13] transition-transform duration-500 [.stat-card:hover_&]:-rotate-6 [.stat-card:hover_&]:scale-105"
        strokeWidth={1.5}
        aria-hidden
      />
      <dt className="relative flex items-center gap-2 text-xs text-muted-foreground">
        <IconChip className="chip-cash text-gold-ink">
          <Wallet />
        </IconChip>
        Cash to spend
      </dt>
      <dd className="relative mt-1.5">
        <AnimatedNumber className="numeric block text-xl font-semibold" value={cash} format={formatCurrency} countUp="fantasy-cash" />
        {hasCash ? (
          <span className="numeric mt-0.5 flex items-center gap-1.5 text-xs font-medium text-gold-ink">
            <span className="live-dot size-1.5 shrink-0 rounded-full bg-[var(--series-4)]" aria-hidden />
            Dry powder · {Math.round(cashPct)}% of your total
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-muted-foreground">All in. Nothing left on the bench.</span>
        )}
      </dd>
    </TiltCard>
  )
}
