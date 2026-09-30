"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Clock, Infinity as Forever, Link2 } from "lucide-react"
import { initialsFor } from "@web/components/ui/avatar"
import { RaceChart } from "@web/components/charts/race-chart"
import { StandingRow } from "@web/components/leagues/standing-row"
import { CashStat, PortfolioStat } from "@web/components/fantasy/balance-cards"
import { TradePanel } from "@web/components/fantasy/trade-panel"
import { TradeFeed, type FeedItem } from "@web/components/fantasy/trade-feed"
import { timeLeft } from "@web/components/fantasy/time-left"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { useRankBaseline } from "@web/components/fantasy/use-rank-baseline"
import { Delta } from "@web/components/ui/delta"
import { LeaguePageSkeleton } from "@web/components/skeletons"
import { revealStyle } from "@web/components/motion/reveal"
import type { Standing } from "@web/components/leagues/standing-row"
import { formatCurrency } from "@web/lib/format"
import { describeMovement, rankMovement } from "@web/lib/rank-change"
import { liveRefreshMs } from "@web/lib/live-refresh"
import { mutate, useApi } from "@web/lib/use-api"
import { useToast } from "@web/components/ui/toast"

/** `averageCost` is stored (trade-derived); `price` is the live quote. Value and gain are measured between them. */
export type Position = { ticker: string; name: string | null; shares: number; averageCost: number; price: number; priceAsOf: string | null; value: number; gainPct: number }

type LeagueData = {
  league: {
    id: string
    name: string
    emoji: string
    inviteCode: string
    startingCash: number
    maxPositionPct: number | null
    endsAt: string | null
    isClosed: boolean
  }
  standings: (Standing & { value: number })[]
  you: { cash: number; value: number; percent: number; rank: number; positions: Position[] }
  feed: FeedItem[]
}

const MEDALS = ["🥇", "🥈", "🥉"]

/** Off-hours pace: standings only move when someone trades. While the market is open it's every minute, see liveRefreshMs. */
const CLOSED_REFRESH_MS = 60_000

export default function FantasyLeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const { data, error, loading, refetch } = useApi<LeagueData>(`/api/fantasy/${id}`, [], { refreshMs: liveRefreshMs(CLOSED_REFRESH_MS) })
  const rankBefore = useRankBaseline(id, data?.you.rank ?? null)

  async function react(toUserId: string, emoji: string) {
    try {
      await mutate(`/api/fantasy/${id}/react`, { body: { toUserId, emoji } })
      await refetch()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't react.", "error")
    }
  }

  if (loading && !data) return <LeaguePageSkeleton />

  // A failed refresh keeps the page up with the last good data.
  if (!data) return <p className="text-sm text-muted-foreground">{error ?? "Couldn't load this league."}</p>

  const { league, standings, you, feed } = data
  const moved = rankMovement(rankBefore, you.rank)

  return (
    <div className="space-y-6">
      <Link href="/fantasy" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Fantasy
      </Link>

      <header className="reveal relative overflow-hidden rounded-3xl border bg-card p-5 sm:p-7" style={revealStyle(0)}>
        <div className="hero-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="absolute -left-10 -top-20 size-56 rounded-full bg-primary/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl" aria-hidden>{league.emoji}</span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{league.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {league.endsAt ? <Clock className="size-3.5" aria-hidden /> : <Forever className="size-3.5" aria-hidden />}
                  {league.isClosed ? "Final standings" : league.endsAt ? timeLeft(league.endsAt) : "All-time league"}
                </span>
                <span>{formatCurrency(league.startingCash)} each</span>
                {league.maxPositionPct ? <span>Max {league.maxPositionPct}% per pick</span> : null}
              </p>
            </div>
          </div>
          <InviteButton code={league.inviteCode} />
        </div>

        <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Your rank">
            <span className="numeric">
              {MEDALS[you.rank - 1] ?? ""}#{you.rank}
              <span className="text-sm font-normal text-muted-foreground"> of {standings.length}</span>
            </span>
            {moved !== null ? (
              <span
                className={`animate-rise-in mt-1 block text-xs font-medium ${moved > 0 ? "text-gain-ink" : "text-loss-ink"}`}
              >
                {moved > 0 ? "▲" : "▼"} {describeMovement(moved)} since your last visit
              </span>
            ) : null}
          </Stat>
          <Stat label="Return">
            <Delta value={you.percent} size="lg" variant="plain" />
          </Stat>
          <PortfolioStat value={you.value} cash={you.cash} startingCash={league.startingCash} />
          <CashStat cash={you.cash} value={you.value} />
        </dl>
      </header>

      {league.isClosed ? <Podium standings={standings} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card className="reveal" style={revealStyle(1)}>
            <CardHeader>
              <CardTitle>The race</CardTitle>
              <p className="text-xs text-muted-foreground">Everyone starts at 100. Updated nightly, plus live values today.</p>
            </CardHeader>
            <CardContent>
              <RaceChart
              rich
                height={260}
                series={standings.map((s) => ({ id: s.userId, label: s.name?.split(" ")[0] ?? s.handle ?? "", initials: initialsFor(s.name, s.handle), points: s.spark, isYou: s.isYou }))}
              />
            </CardContent>
          </Card>

          <Card className="reveal" style={revealStyle(2)}>
            <CardHeader>
              <CardTitle>Standings</CardTitle>
              <p className="text-xs text-muted-foreground">Matching returns to 0.01% share a rank.</p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {standings.map((s) => (
                  <StandingRow key={s.userId} standing={s} onReact={react} showSource={false} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <aside className="reveal min-w-0 space-y-6" style={revealStyle(2)}>
          {!league.isClosed ? <TradePanel leagueId={league.id} cash={you.cash} positions={you.positions} onTraded={refetch} /> : null}
          <Holdings positions={you.positions} />
          <TradeFeed items={feed} />
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background/70 p-3 backdrop-blur">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{children}</dd>
    </div>
  )
}

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full"
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}/fantasy/join/${code}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? "Link copied" : "Invite friends"}
    </Button>
  )
}

function Holdings({ positions }: { positions: Position[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your picks</CardTitle>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet. Cash doesn&apos;t win leagues.</p>
        ) : (
          <ul className="divide-y">
            {positions.map((p) => (
              <li key={p.ticker} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary font-mono text-[11px] font-bold">
                  {p.ticker.slice(0, 4)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="numeric text-sm font-medium">{formatCurrency(p.value)}</p>
                  <p className="numeric truncate text-xs text-muted-foreground">
                    {p.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh @ {formatCurrency(p.averageCost)} avg
                  </p>
                  <p className="numeric truncate text-xs text-muted-foreground">Now {formatCurrency(p.price)}</p>
                </div>
                <Delta value={p.gainPct} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Podium({ standings }: { standings: Standing[] }) {
  const top = standings.filter((s) => s.rank <= 3)
  const order = top.length === 3 && top.every((s, i) => s.rank === i + 1)
    ? [top[1]!, top[0]!, top[2]!]
    : top
  const heights: Record<number, string> = { 1: "h-28", 2: "h-20", 3: "h-14" }
  return (
    <section className="rounded-3xl border bg-card p-6 text-center" aria-label="Final podium">
      <p className="text-sm font-semibold text-primary">Season over</p>
      <div className="mt-6 flex flex-wrap items-end justify-center gap-3">
        {order.map((s) => (
          <div key={s.userId} className="flex w-24 flex-col items-center gap-2">
            <span className="text-2xl" aria-hidden>{MEDALS[s.rank - 1]}</span>
            <span className="truncate text-sm font-medium">{s.name?.split(" ")[0] ?? s.handle}</span>
            <Delta value={s.percent} size="sm" />
            <div className={`w-full rounded-t-xl bg-primary/15 ${heights[s.rank]}`} />
          </div>
        ))}
      </div>
    </section>
  )
}
