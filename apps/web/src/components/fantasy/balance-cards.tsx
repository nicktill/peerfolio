"use client"

import { useEffect, useState } from "react"
import { Briefcase, Medal, Trophy, TrendingUp, Wallet } from "lucide-react"
import { HeadlineNumber } from "@web/components/ui/headline-number"
import { Delta } from "@web/components/ui/delta"
import { formatCurrency } from "@web/lib/format"
import { cashSplit } from "@web/lib/fantasy-rules"
import { describeMovement } from "@web/lib/rank-change"

/** Whole cents, so a fill's rounding noise never reads as a gain or a loss. */
const cents = (n: number) => Math.round(n * 100) / 100

/** Sign is spelled out (not just colour) so direction survives colour-blindness. */
const signedCurrency = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`

/** Open stat: a small mono label over a large figure, no card around it. */
export function Stat({ label, icon, tone, children }: { label: React.ReactNode; icon?: React.ReactNode; tone?: "rank" | "return" | "value" | "cash"; children: React.ReactNode }) {
  return (
    <div className="fw-stat" data-tone={tone}>
      <dt>
        {icon ? <span className="fw-stat-ic" aria-hidden>{icon}</span> : null}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Where you stand, and how far you've moved since you were last here. */
export function RankStat({ rank, total, moved }: { rank: number; total: number; moved: number | null }) {
  // Rank 0 is someone sitting out: no place in the table until they buy something.
  if (rank === 0) {
    return (
      <Stat label="Your rank" icon={<Trophy />} tone="rank">
        <span className="fw-figure">Unranked</span>
        <span className="fw-sub">Buy something to get back in the table</span>
      </Stat>
    )
  }
  return (
    <Stat label="Your rank" icon={<Trophy />} tone="rank">
      <span className="fw-figure">
        {rank <= 3 ? <span className="fw-medal" data-rank={rank} aria-hidden><Medal /></span> : null}#{rank}
        <small>of {total}</small>
      </span>
      {moved !== null ? (
        <span className={`fw-sub fw-move ${moved > 0 ? "fw-up" : "fw-down"}`}>
          {moved > 0 ? "▲" : "▼"} {describeMovement(moved)}
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
    <Stat label="Your return" icon={<TrendingUp />} tone="return">
      <span className="fw-figure">
        <Delta value={percent} size="lg" variant="plain" className="fw-delta" />
      </span>
      <span className="fw-sub" data-tone={tone}>
        {tone === "flat" ? "Even with the start" : <><b>{signedCurrency(profit)}</b> since start</>}
      </span>
    </Stat>
  )
}

/** Everything you're worth, and how much of it is out working versus sitting on the bench. */
export function PortfolioStat({ value, cash }: { value: number; cash: number; startingCash?: number }) {
  const { investedPct } = cashSplit(value, cash)

  return (
    <Stat label="Portfolio value" icon={<Briefcase />} tone="value">
      <HeadlineNumber className="fw-figure" id="fantasy-value" value={value} currency />
      <span className="fw-sub">{investedPct >= 99.5 ? "All in picks" : `${Math.round(investedPct)}% in picks`}</span>
      <SplitBar value={value} cash={cash} variant="tile" />
    </Stat>
  )
}

/** Spendable cash. */
export function CashStat({ cash, value }: { cash: number; value: number }) {
  const { cashPct } = cashSplit(value, cash)
  const hasCash = cash >= 0.01

  return (
    <Stat label="Cash to spend" icon={<Wallet />} tone="cash">
      <HeadlineNumber className="fw-figure" id="fantasy-cash" value={cash} currency />
      {hasCash ? (
        <span className="fw-sub">
          {Math.round(cashPct)}% of your total
        </span>
      ) : (
        <span className="fw-sub">All in. Nothing left on the bench.</span>
      )}
    </Stat>
  )
}

/** Picks versus cash as one slim bar, legend inline. */
export function SplitBar({ value, cash, variant = "row" }: { value: number; cash: number; variant?: "row" | "tile" }) {
  const { cashPct, investedPct } = cashSplit(value, cash)
  // The bar starts empty and fills once mounted, so it grows in instead of appearing.
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className={`fw-split fw-split-${variant}`}>
      <span><i className="fw-dot-picks" aria-hidden />{Math.round(investedPct)}% picks</span>
      <span className="fw-balance-bar" aria-hidden>
        <i className="stat-bar fw-dot-picks" style={{ width: filled ? `${investedPct}%` : "0%" }} />
        <i className="stat-bar fw-dot-cash" style={{ width: filled ? `${cashPct}%` : "0%" }} />
      </span>
      <span><i className="fw-dot-cash" aria-hidden />{Math.round(cashPct)}% cash</span>
    </div>
  )
}
