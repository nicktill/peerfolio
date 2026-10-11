"use client"

import { useEffect, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { HeadlineNumber } from "@web/components/ui/headline-number"
import { Delta } from "@web/components/ui/delta"
import { formatCurrency } from "@web/lib/format"
import { cashSplit } from "@web/lib/fantasy-rules"
import { describeMovement } from "@web/lib/rank-change"

/** Whole cents, so a fill's rounding noise never reads as a gain or a loss. */
const cents = (n: number) => Math.round(n * 100) / 100

/** Sign is spelled out (not just colour) so direction survives colour-blindness. */
const signedCurrency = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`

const MEDALS = ["🥇", "🥈", "🥉"]

/** Open stat: a small mono label over a large figure, no card around it. */
export function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fw-stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Where you stand, and how far you've moved since you were last here. */
export function RankStat({ rank, total, moved }: { rank: number; total: number; moved: number | null }) {
  return (
    <Stat label="Your rank">
      <span className="fw-figure">
        {MEDALS[rank - 1] ? <span aria-hidden className="mr-1.5 text-[0.7em]">{MEDALS[rank - 1]}</span> : null}#{rank}
        <small>of {total}</small>
      </span>
      {moved !== null ? (
        <span className={`fw-sub fw-move ${moved > 0 ? "fw-up" : "fw-down"}`}>
          {moved > 0 ? "▲" : "▼"} {describeMovement(moved)} since your last visit
        </span>
      ) : (
        <span className="fw-sub">{rank === 1 ? "Leading the league" : `${total - rank} ${total - rank === 1 ? "player" : "players"} behind you`}</span>
      )}
    </Stat>
  )
}

/** Your return, with the dollars behind it. */
export function ReturnStat({ percent, value, startingCash }: { percent: number; value: number; startingCash: number }) {
  const profit = cents(value - startingCash)
  const tone = profit > 0 ? "up" : profit < 0 ? "down" : "flat"
  return (
    <Stat label="Your return">
      <span className="fw-figure">
        <Delta value={percent} size="lg" variant="plain" className="fw-delta" />
      </span>
      <span className="fw-sub" data-tone={tone}>
        {tone === "flat" ? "Even with the start" : <><b>{signedCurrency(profit)}</b> since the start</>}
      </span>
    </Stat>
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
    <Stat label="Portfolio value">
      <HeadlineNumber className="fw-figure" id="fantasy-value" value={value} currency />
      <span className="fw-sub" data-tone={direction}>
        <Arrow aria-hidden />
        {direction === "flat" ? "Even with the start" : <><b>{signedCurrency(profit)}</b> since the start</>}
      </span>
      <span className="fw-balance-bar" aria-hidden>
        <i className="stat-bar fw-dot-picks" style={{ width: filled ? `${investedPct}%` : "0%" }} />
        <i className="stat-bar fw-dot-cash" style={{ width: filled ? `${cashPct}%` : "0%" }} />
      </span>
      <span className="fw-balance-labels">
        <span><i className="fw-dot-picks" aria-hidden />{Math.round(investedPct)}% picks</span>
        <span><i className="fw-dot-cash" aria-hidden />{Math.round(cashPct)}% cash</span>
      </span>
    </Stat>
  )
}

/** Spendable cash. */
export function CashStat({ cash, value }: { cash: number; value: number }) {
  const { cashPct } = cashSplit(value, cash)
  const hasCash = cash >= 0.01

  return (
    <Stat label="Cash available">
      <HeadlineNumber className="fw-figure" id="fantasy-cash" value={cash} currency />
      {hasCash ? (
        <span className="fw-sub">
          <span className="fw-live-dot" aria-hidden />
          Dry powder · {Math.round(cashPct)}% of your total
        </span>
      ) : (
        <span className="fw-sub">All in. Nothing left on the bench.</span>
      )}
    </Stat>
  )
}
