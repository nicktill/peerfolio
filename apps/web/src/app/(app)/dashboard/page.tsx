"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Eye, EyeOff, RefreshCw, ShieldCheck, Sparkles, Wallet } from "lucide-react"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { Reveal } from "@web/components/motion/reveal"
import { DashboardSkeleton } from "@web/components/skeletons"
import { AnimatedNumber } from "@web/components/ui/animated-number"
import { plural } from "@web/lib/plural"
import { useToast } from "@web/components/ui/toast"
import { type AllocationSlice } from "@web/components/charts/allocation-bar"
import { PerformanceChart } from "@web/components/charts/performance-chart"
import { AccountsCard, type AccountRow, type ItemRow } from "@web/components/dashboard/accounts-card"
import { ConnectButton } from "@web/components/dashboard/connect-button"
import { HoldingsTable, type HoldingRow } from "@web/components/dashboard/holdings-table"
import { AddAccountButton } from "@web/components/dashboard/add-account-dialog"
import { formatDate, formatPercent } from "@web/lib/format"
import { isUsMarketOpen } from "@web/lib/market-hours"
import { cn } from "@web/lib/utils"
import { liveRefreshMs } from "@web/lib/live-refresh"
import { mutate, useApi } from "@web/lib/use-api"
import { defaultRange, rangeAvailability, rangeUnlockDays, RANGES, type Range } from "@web/lib/ranges"

type PortfolioResponse = {
  summary: { totalAssets: number; totalLiabilities: number; netWorth: number; investableAssets: number }
  accounts: AccountRow[]
  items: ItemRow[]
  allocation: AllocationSlice[]
  holdings: HoldingRow[]
  today: { amount: number; percent: number; asOf: string | null } | null
  allTime: { amount: number; percent: number; cost: number; coverage: number } | null
  leagues: { id: string; name: string; emoji: string; rank: number | null; members: number }[]
  history: { date: string; netWorth: number; investableAssets: number }[]
  performance: { percent: number; days: number; range: Range; series: { date: string; indexed: number }[] }
  hasHistory: boolean
  firstDate: string | null
  isVerified: boolean
}

const RANGE_NAMES: Record<Range, string> = { "1W": "week", "1M": "month", "3M": "3 months", "6M": "6 months", "1Y": "year", ALL: "period" }
const usd = (v: number) => `$${new Intl.NumberFormat("en-US").format(v)}`
/** Signed dollars: cents while the amount is small, whole dollars once it isn't. */
const signedUsd = (v: number) => {
  const abs = Math.abs(v)
  const digits = abs >= 10_000 ? 0 : 2
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}$${new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(abs)}`
}
/** Today's date in New York, the market's calendar. */
const marketToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())

export default function DashboardPage() {
  const { toast } = useToast()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [range, setRange] = useState<Range>("1M")
  // Until someone picks a range themselves, show the longest one their history can fill.
  const pickedRange = useRef(false)
  const [hidden, setHidden] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const { data, loading, error, refetch } = useApi<PortfolioResponse>(`/api/portfolio?range=${range}`, [range], { refreshMs: liveRefreshMs(300_000) })

  useEffect(() => {
    if (!data || pickedRange.current) return
    const wanted = defaultRange(data.firstDate, marketToday())
    if (wanted !== range) setRange(wanted)
  }, [data, range])

  async function sync() {
    setSyncing(true)
    try {
      await mutate("/api/sync")
      toast("Accounts refreshed.", "success")
      await refetch()
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't refresh.", "error")
    } finally {
      setSyncing(false)
    }
  }

  if (loading && !data) return <DashboardSkeleton />

  if (error && !data) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={Wallet}
            title="Couldn't load your portfolio"
            description={error}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  if (data.accounts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={Sparkles}
            title="Let's see your portfolio"
            description="Add an account and type in what you hold. We price it every night from market data and start your track record today, so the sooner you start, the longer your history. Linking a brokerage for verified returns is coming soon."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <AddAccountButton onCreated={() => void refetch()}>Add an account</AddAccountButton>
                <ConnectButton onConnected={refetch} />
              </div>
            }
          />
        </CardContent>
      </Card>
    )
  }

  // Plot the time-weighted series, not net worth. They disagree whenever money
  // moves in or out, and showing the dollar line under a time-weighted
  // percentage told two different stories six pixels apart.
  const series = data.performance.series.map((p) => ({ date: p.date, value: p.indexed }))

  const available = rangeAvailability(data.firstDate, marketToday())
  const unlockIn = rangeUnlockDays(data.firstDate, marketToday())
  // Only ranges the history can fill are offered; locked ones are described in the
  // line under the title instead of sitting there greyed out.
  const rangeOptions = RANGES.filter((r) => available[r]).map((r) => ({ value: r, label: r }))
  const nextRange = RANGES.filter((r) => !available[r]).sort((a, b) => unlockIn[a] - unlockIn[b])[0]
  const windowCoversAll = range === "ALL" || !available[range]
  const points = data.performance.series
  const shown = hoverIndex != null ? points[hoverIndex] : points[points.length - 1]
  const shownPercent = shown ? shown.indexed - 100 : data.performance.percent

  const netWorthWhole = Math.floor(data.summary.netWorth)
  const cents = Math.round((data.summary.netWorth - netWorthWhole) * 100)
  const marketOpen = isUsMarketOpen(new Date())
  const isToday = data.today?.asOf === marketToday()
  const todayLabel = data.today?.asOf ? (isToday ? "today" : `on ${formatDate(`${data.today.asOf}T12:00:00`, "short")}`) : "today"

  return (
    <div className="space-y-6">
      {error ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm text-muted-foreground">
          <p>Couldn’t refresh your portfolio. Showing the last loaded balances.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : null}
      <Reveal index={0} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-medium text-muted-foreground">Net worth</h1>
          {data.isVerified ? (
            <Badge variant="verified">
              <ShieldCheck aria-hidden />
              Verified
            </Badge>
          ) : (
            <Badge variant="outline">Self-reported</Badge>
          )}

          {data.leagues.length > 0 ? (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="mr-1 hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:inline">Leagues</span>
              {data.leagues.slice(0, 4).map((league) => (
                <Link
                  key={league.id}
                  href={`/leagues/${league.id}`}
                  className="press inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs transition-colors hover:bg-secondary"
                >
                  <span className="max-w-[9rem] truncate font-semibold">{league.name}</span>
                  {league.rank != null ? <span className={cn("numeric font-bold", league.rank === 1 ? "text-gold-ink" : "text-muted-foreground")}>#{league.rank}</span> : null}
                </Link>
              ))}
              {data.leagues.length > 4 ? <span className="text-xs text-muted-foreground">+{data.leagues.length - 4}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="font-display text-6xl font-semibold leading-none tracking-tight sm:text-7xl lg:text-[76px]" style={{ letterSpacing: "-0.04em" }}>
            {hidden ? (
              "••••••"
            ) : (
              <>
                <AnimatedNumber className="numeric" value={netWorthWhole} format={usd} />
                <span className="numeric text-[0.42em] text-muted-foreground" style={{ letterSpacing: "-0.02em" }}>
                  .{String(cents).padStart(2, "0")}
                </span>
              </>
            )}
          </p>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setHidden(!hidden)}>
              {hidden ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
              <span className="sr-only">{hidden ? "Show balances" : "Hide balances"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void sync()} loading={syncing}>
              {!syncing ? <RefreshCw aria-hidden /> : null}
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {data.today && !hidden ? (
            <span
              className={cn(
                "numeric inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
                data.today.amount >= 0 ? "tint-gain text-gain-ink" : "tint-loss text-loss-ink",
              )}
            >
              {data.today.amount >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
              {signedUsd(data.today.amount)} <span className="font-medium opacity-80">{formatPercent(data.today.percent)}</span>
              <span className="font-medium opacity-80">{todayLabel}</span>
            </span>
          ) : null}
          {data.today && isToday && marketOpen ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2 animate-pulse rounded-full bg-[--gain]" aria-hidden />
              Live · market open
            </span>
          ) : null}
          {data.allTime && !hidden ? (
            <span className="text-xs text-muted-foreground" title={`Across the ${Math.round(data.allTime.coverage * 100)}% of your holdings that have an average cost`}>
              Since purchase{" "}
              <span className={cn("numeric font-semibold", data.allTime.amount >= 0 ? "text-gain-ink" : "text-loss-ink")}>
                {signedUsd(data.allTime.amount)} ({formatPercent(data.allTime.percent, 0)})
              </span>
            </span>
          ) : null}
        </div>
      </Reveal>

      <Reveal index={1} className="grid items-start gap-6 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Sticks while a long accounts list scrolls past beside it. */}
        {/* With a chart it sticks beside a long accounts list. Empty, it keeps a fixed height, so opening or closing an account never resizes it. */}
        <Card className={cn(data.hasHistory ? "lg:sticky lg:top-20" : "lg:min-h-[32rem]", "flex flex-col")}>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Return</CardTitle>
              {data.hasHistory ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Since you started tracking. Deposits and withdrawals don’t count.
                  {nextRange ? ` ${nextRange} unlocks in ${plural(unlockIn[nextRange], "day")}.` : ""}
                </p>
              ) : null}
              {data.hasHistory ? (
                <div className="mt-3 flex items-baseline gap-3">
                  <span className={cn("numeric font-display text-4xl font-semibold leading-none", shownPercent >= 0 ? "text-gain-ink" : "text-loss-ink")}>
                    {formatPercent(shownPercent)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {hoverIndex != null && shown
                      ? formatDate(shown.date)
                      : windowCoversAll && data.firstDate
                        ? `since ${formatDate(`${data.firstDate}T12:00:00`)} · ${plural(data.performance.days, "day")} tracked`
                        : `last ${RANGE_NAMES[range]}`}
                  </span>
                </div>
              ) : null}
            </div>
            {rangeOptions.length > 1 ? (
              <Segmented<Range>
                options={rangeOptions}
                value={range}
                onChange={(r) => {
                  pickedRange.current = true
                  setHoverIndex(null)
                  setRange(r)
                }}
                size="sm"
                label="Time range"
                className="shrink-0"
              />
            ) : null}
          </CardHeader>
          <CardContent className={cn(!data.hasHistory && "flex flex-1 items-center justify-center")}>
            {data.hasHistory ? (
              <PerformanceChart
                points={series}
                height={340}
                baseline={100}
                onHover={setHoverIndex}
                ariaLabel={`Time-weighted return over the last ${range}`}
                valueFormatter={(v) => `${v >= 100 ? "+" : "−"}${Math.abs(v - 100).toFixed(2)}%`}
              />
            ) : (
              /* Being honest beats drawing a line through invented data. */
              <EmptyState
                icon={Sparkles}
                title="Your history starts now"
                description="We snapshot your portfolio once a day. Check back tomorrow for your first data point."
              />
            )}
          </CardContent>
        </Card>

        <AccountsCard accounts={data.accounts} items={data.items} hidden={hidden} onChange={refetch} />
      </Reveal>

      <Reveal index={2}>
        <HoldingsTable
          holdings={data.holdings}
          allocation={data.allocation}
          hidden={hidden}
          todayLabel={data.today?.asOf && !isToday ? formatDate(`${data.today.asOf}T12:00:00`, "short") : "Today"}
        />
      </Reveal>
    </div>
  )
}
