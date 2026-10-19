"use client"

import "@web/components/fantasy/fantasy-workspace.css"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, Flag, Infinity as Forever, Link2, Settings2 } from "lucide-react"
import { initialsFor } from "@web/components/ui/avatar"
import { RaceChart } from "@web/components/charts/race-chart"
import { StandingsTable } from "@web/components/fantasy/standings-table"
import { EditLeagueDialog } from "@web/components/fantasy/edit-league-dialog"
import { CashStat, PortfolioStat, RankStat, ReturnStat, SplitBar } from "@web/components/fantasy/balance-cards"
import { TradePanel } from "@web/components/fantasy/trade-panel"
import { TradeFeed, type FeedItem } from "@web/components/fantasy/trade-feed"
import { LeagueMark } from "@web/components/league/league-mark"
import { Tip } from "@web/components/ui/tip"
import { LeagueTop } from "@web/components/fantasy/season/league-top"
import { timeLeft } from "@web/components/fantasy/time-left"
import { useRankBaseline } from "@web/components/fantasy/use-rank-baseline"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { Delta } from "@web/components/ui/delta"
import { LeaguePageSkeleton } from "@web/components/skeletons"
import { revealStyle } from "@web/components/motion/reveal"
import { TickerLogo } from "@web/components/ui/ticker-logo"
import type { Standing } from "@web/components/leagues/standing-row"
import { formatCurrency } from "@web/lib/format"
import { plural } from "@web/lib/plural"
import { rankMovement } from "@web/lib/rank-change"
import { liveRefreshMs } from "@web/lib/live-refresh"
import { mutate, useApi } from "@web/lib/use-api"
import { useToast } from "@web/components/ui/toast"

/** `averageCost` is stored (trade-derived); `price` is the live quote. Value and gain are measured between them. */
export type Position = { ticker: string; name: string | null; shares: number; averageCost: number; price: number; priceAsOf: string | null; value: number; gainPct: number }

/** An order waiting for the open, or one the open turned down (`reason` says why). */
type Order = {
  id: string
  side: "buy" | "sell"
  ticker: string
  name: string | null
  amount: number | null
  shares: number | null
  price: number
  status: "pending" | "rejected" | "cancelled"
  reason: string | null
  at: string
}

type LeagueData = {
  league: {
    id: string
    name: string
    emoji: string
    accent: string
    isOwner: boolean
    inviteCode: string
    startingCash: number
    maxPositionPct: number | null
    endsAt: string | null
    isClosed: boolean
    activeCount: number
  }
  standings: (Standing & { value: number })[]
  you: { cash: number; value: number; percent: number; rank: number; positions: Position[]; orders: Order[] }
  feed: FeedItem[]
  /** Null for a league that never turned weekly rounds on: it looks and works exactly as before. */
  season: { mode: "trading" | "draft" } | null
}

/** Off-hours pace: standings only move when someone trades. While the market is open it's every minute, see liveRefreshMs. */
const CLOSED_REFRESH_MS = 60_000

export default function FantasyLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const { data, error, loading, refetch } = useApi<LeagueData>(`/api/fantasy/${id}`, [], { refreshMs: liveRefreshMs(CLOSED_REFRESH_MS) })
  const rankBefore = useRankBaseline(id, data?.you.rank ? data.you.rank : null)
  const router = useRouter()
  const isDraft = data?.season?.mode === "draft"
  // A draft league has no portfolio to trade, so its home is the season page.
  useEffect(() => {
    if (isDraft) router.replace(`/fantasy/${id}/season`)
  }, [isDraft, id, router])

  async function cancelOrder(orderId: string) {
    try {
      await mutate(`/api/fantasy/${id}/orders/${orderId}`, { method: "DELETE" })
      await refetch()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't cancel that order.", "error")
      await refetch()
    }
  }

  async function react(toUserId: string, emoji: string) {
    try {
      await mutate(`/api/fantasy/${id}/react`, { body: { toUserId, emoji } })
      await refetch()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't react.", "error")
    }
  }

  if (loading && !data) return <LeaguePageSkeleton />
  if (isDraft) return <LeaguePageSkeleton />

  // A failed refresh keeps the page up with the last good data.
  if (!data) return <p className="text-sm text-muted-foreground">{error ?? "Couldn't load this league."}</p>

  const { league, standings, you, feed } = data
  const moved = you.rank > 0 ? rankMovement(rankBefore, you.rank) : null
  const status = league.isClosed ? "Final standings" : league.endsAt ? timeLeft(league.endsAt) : "All-time"

  return (
    <div className="fw fw-play-space" data-play-world="stocks" data-accent={league.accent}>
      <Link href="/fantasy" className="fw-back">
        <ArrowLeft className="size-3.5" aria-hidden /> Fantasy leagues
      </Link>

      <header className="fw-head reveal" data-accent={league.accent} style={revealStyle(0)}>
        <div className="fw-identity">
          <span className="fw-art" data-accent={league.accent} aria-hidden>
            <LeagueMark value={league.emoji} accent={league.accent} size={42} />
          </span>
          <div>
            <span className="fw-eyebrow">Fantasy / Play money</span>
            <h1>{league.name}</h1>
          </div>
        </div>
        <ul className="fw-meta" aria-label="League rules">
          <li className="fw-meta-status">{status}</li>
          <li>{plural(standings.length, "player")}</li>
          <li>{formatCurrency(league.startingCash)} each</li>
          <li>{league.maxPositionPct ? `max ${league.maxPositionPct}% per pick` : "no position cap"}</li>
        </ul>
        <div className="fw-actions">
          <span className="fw-pill">
            {league.isClosed ? <Flag aria-hidden /> : league.endsAt ? <Clock aria-hidden /> : <Forever aria-hidden />}
            {status}
          </span>
          {data.season ? (
            <Tip text="A fresh scoreboard each round. The best round earns the most points. Tap to see the season.">
              <Link href={`/fantasy/${id}/season`} className="fw-pill fw-live-pill">
                <i aria-hidden /> Seasons on <ArrowRight aria-hidden />
              </Link>
            </Tip>
          ) : null}
          {league.isOwner && !league.isClosed ? (
            <button type="button" className="fw-btn fw-btn-icon" onClick={() => setEditing(true)} aria-label="Edit league" title="Edit league">
              <Settings2 aria-hidden />
            </button>
          ) : null}
          {league.isOwner && !league.isClosed && !data.season ? (
            <Tip text="Add a second scoreboard in weekly, monthly or quarterly rounds. Your standings and trades stay as they are.">
              <Link href={`/fantasy/${id}/season`} className="fw-btn">
                <CalendarDays aria-hidden />
                Turn on seasons
              </Link>
            </Tip>
          ) : null}
          <InviteButton code={league.inviteCode} />
        </div>
      </header>

      {data.season ? (
        <LeagueTop leagueId={league.id} rank={you.rank} total={league.activeCount} moved={moved} percent={you.percent} value={you.value} cash={you.cash} startingCash={league.startingCash} />
      ) : (
        <dl className="fw-panel fw-scoreboard reveal" style={revealStyle(1)}>
          <RankStat rank={you.rank} total={league.activeCount} moved={moved} />
          <ReturnStat percent={you.percent} value={you.value} startingCash={league.startingCash} />
          <PortfolioStat value={you.value} cash={you.cash} />
          <CashStat cash={you.cash} value={you.value} />
          <SplitBar value={you.value} cash={you.cash} />
        </dl>
      )}

      {league.isOwner && !league.isClosed ? (
        <EditLeagueDialog league={league} members={standings} open={editing} onClose={() => setEditing(false)} onSaved={refetch} />
      ) : null}

      <div className="fw-grid">
        <div className="fw-main">
          <section className="fw-panel reveal" style={revealStyle(2)} aria-labelledby="fw-race-title">
            <div className="fw-section-head">
              <h2 id="fw-race-title">The race</h2>
              <p>Tap a day. See who’s ahead.</p>
            </div>
            <div className="fw-race">
              <RaceChart
                rich
                explore
                height={260}
                series={standings.filter((s) => !s.inactive).map((s) => ({ id: s.userId, label: s.name?.split(" ")[0] ?? s.handle ?? "", initials: initialsFor(s.name, s.handle), points: s.spark, isYou: s.isYou }))}
              />
            </div>
          </section>

          <section className="fw-panel reveal" style={revealStyle(3)} aria-labelledby="fw-standings-title">
            <div className="fw-section-head">
              <h2 id="fw-standings-title">Standings</h2>
              <p>Matching returns to 0.01% share a rank.</p>
            </div>
            <StandingsTable standings={standings} onReact={react} />
          </section>
        </div>

        <aside className="fw-rail reveal" style={revealStyle(3)}>
          <TradePanel leagueId={league.id} cash={you.cash} positions={you.positions} onTraded={refetch} closed={league.isClosed} allowNote={!!data.season} />
          <Holdings positions={you.positions} orders={you.orders} onCancel={league.isClosed ? undefined : cancelOrder} />
          <TradeFeed items={feed} leagueId={league.id} onChanged={refetch} />
        </aside>
      </div>
    </div>
  )
}

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="fw-btn fw-invite"
      aria-label={copied ? "Link copied" : "Copy league invite link"}
      data-solid
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}/fantasy/join/${code}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      <span className="fw-invite-label-full">{copied ? "Link copied" : "Invite friends"}</span>
      <span className="fw-invite-label-short">{copied ? "Copied" : "Invite"}</span>
    </button>
  )
}

const fmtShares = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })

function Holdings({ positions, orders, onCancel }: { positions: Position[]; orders: Order[]; onCancel?: (orderId: string) => void }) {
  // A row flashes when you've just bought or sold it, so the trade visibly lands here.
  const before = useRef<Map<string, number> | null>(null)
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const now = new Map(positions.map((p) => [p.ticker, p.shares]))
    const prev = before.current
    before.current = now
    if (!prev) return
    const changed = positions.filter((p) => prev.get(p.ticker) !== p.shares).map((p) => p.ticker)
    if (changed.length === 0) return
    setFlash(new Set(changed))
    const timer = setTimeout(() => setFlash(new Set()), 1900)
    return () => clearTimeout(timer)
  }, [positions])

  const pending = orders.filter((o) => o.status === "pending")
  // A queued buy is yours already: it shows as a pick with the cash set aside, but no shares or average cost until the open sets the price.
  const pendingBuys = pending.filter((o) => o.side === "buy")
  const sellsBy = new Map<string, Order[]>()
  for (const o of pending.filter((o) => o.side === "sell")) sellsBy.set(o.ticker, [...(sellsBy.get(o.ticker) ?? []), o])
  const unfilled = orders.filter((o) => o.status !== "pending")

  return (
    <section className="fw-panel reveal" style={revealStyle(4)} aria-labelledby="fw-picks-title">
      <div className="fw-section-head">
        <h2 id="fw-picks-title">Your picks</h2>
        <p>{positions.length + pendingBuys.length === 0 ? "No positions" : plural(positions.length + pendingBuys.length, "position")}</p>
      </div>
      {positions.length === 0 && pendingBuys.length === 0 ? (
        <p className="fw-empty">Nothing yet. Cash doesn&apos;t win leagues.</p>
      ) : (
        <ul className="fw-picks">
          {pendingBuys.map((o) => (
            <li key={o.id} className="fw-pick">
              <TickerLogo symbol={o.ticker} size="sm" className="shrink-0 rounded-lg border-dashed" />
              <div className="fw-pick-body">
                <strong className="numeric">{formatCurrency(o.amount ?? 0)}</strong>
                <span>Buys at the next live price · no average cost yet</span>
                {o.price > 0 ? <span className="numeric">Last {formatCurrency(o.price)}</span> : null}
              </div>
              <div className="fw-pick-side">
                <span className="fw-pending-tag">Pending</span>
                {onCancel ? <CancelOrder onClick={() => onCancel(o.id)} /> : null}
              </div>
            </li>
          ))}
          {positions.map((p) => (
            <li key={p.ticker} className={`fw-pick ${flash.has(p.ticker) ? "pick-flash" : ""}`}>
              <TickerLogo symbol={p.ticker} size="sm" className="shrink-0 rounded-lg" />
              <div className="fw-pick-body">
                <strong className="numeric">
                  <AnimatedNumber value={p.value} format={formatCurrency} />
                </strong>
                <span className="numeric">
                  {fmtShares(p.shares)} sh @ {formatCurrency(p.averageCost)} avg
                </span>
                <span className="numeric">Now {formatCurrency(p.price)}</span>
                {(sellsBy.get(p.ticker) ?? []).map((o) => (
                  <span key={o.id} className="numeric fw-selling">
                    Selling {o.shares === null ? "all" : `${fmtShares(o.shares)} sh`} at the next live price
                    {onCancel ? <CancelOrder onClick={() => onCancel(o.id)} /> : null}
                  </span>
                ))}
              </div>
              <Delta value={p.gainPct} size="sm" />
            </li>
          ))}
        </ul>
      )}
      {unfilled.length > 0 ? (
        <ul className="fw-rejected">
          {unfilled.map((o) => (
            <li key={o.id}>
              Your queued {o.side} of {o.ticker} didn&apos;t go through: {o.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function CancelOrder({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="fw-link">
      Cancel
    </button>
  )
}
