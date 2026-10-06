"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, ChevronRight, Eye, EyeOff, Info, Newspaper, RefreshCw, ShieldCheck, Sparkles, Wallet } from "lucide-react"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { SectionCard, SectionLabel } from "@web/components/ui/section-card"
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
import { mutate } from "@web/lib/use-api"
import { defaultRange, rangeAvailability, rangeUnlockDays, RANGES, type Range } from "@web/lib/ranges"

export type PortfolioResponse = {
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

/** Where the screen gets its numbers: the live API, or a fixture for the sign-in-free preview. */
export type PortfolioSource = (range: Range) => {
  data: PortfolioResponse | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void> | void
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

/**
 * The portfolio as one page: net worth up top, then a main column (return,
 * holdings) beside a rail (accounts, leagues, news). Every card shares the
 * labelled-header anatomy, so it reads as one view rather than a stack of
 * widgets. `demo` swaps the server actions for a note, for the preview route.
 */
export function PortfolioScreen({ useSource, demo = false }: { useSource: PortfolioSource; demo?: boolean }) {
  const { toast } = useToast()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [range, setRange] = useState<Range>("1M")
  // Until someone picks a range themselves, show the longest one their history can fill.
  const pickedRange = useRef(false)
  const [hidden, setHidden] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const { data, loading, error, refetch } = useSource(range)

  useEffect(() => {
    if (!data || pickedRange.current) return
    const wanted = defaultRange(data.firstDate, marketToday())
    if (wanted !== range) setRange(wanted)
  }, [data, range])

  async function sync() {
    if (demo) {
      toast("This is a demo portfolio, so there's nothing to refresh.", "info")
      return
    }
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
  // note beside the readout instead of sitting there greyed out.
  const rangeOptions = RANGES.filter((r) => available[r]).map((r) => ({ value: r, label: r }))
  const nextRange = RANGES.filter((r) => !available[r]).sort((a, b) => unlockIn[a] - unlockIn[b])[0]
  const windowCoversAll = range === "ALL" || !available[range]
  const points = data.performance.series
  const shown = hoverIndex != null ? points[hoverIndex] : points[points.length - 1]
  const shownPercent = shown ? shown.indexed - 100 : data.performance.percent
  const explainer = `How your investments have done since you added them here. Money you add or withdraw doesn’t count.${nextRange ? ` The ${nextRange} view unlocks in ${plural(unlockIn[nextRange], "day")}.` : ""}`

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

      <Reveal index={0} className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SectionLabel as="h1">Net worth</SectionLabel>
            {data.isVerified ? (
              <Badge variant="verified">
                <ShieldCheck aria-hidden />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline">Self-reported</Badge>
            )}
            {demo ? (
              <Badge variant="outline" className="border-dashed">
                Demo data
              </Badge>
            ) : null}
          </div>

          <p className="font-display text-5xl font-semibold leading-none sm:text-[56px]" style={{ letterSpacing: "-0.035em" }}>
            {hidden ? (
              "••••••"
            ) : (
              <>
                <AnimatedNumber className="numeric" value={netWorthWhole} format={usd} />
                <span className="numeric text-[0.5em] text-muted-foreground" style={{ letterSpacing: "-0.02em" }}>
                  .{String(cents).padStart(2, "0")}
                </span>
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {data.today ? (
              <span
                className={cn(
                  "numeric inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold",
                  data.today.amount >= 0 ? "tint-gain text-gain-ink" : "tint-loss text-loss-ink",
                )}
              >
                {data.today.amount >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                {hidden ? null : <>{signedUsd(data.today.amount)} </>}
                <span className={hidden ? "" : "font-medium opacity-80"}>{formatPercent(data.today.percent)}</span>
                <span className="font-medium opacity-80">{todayLabel}</span>
              </span>
            ) : null}
            {data.today && isToday && marketOpen ? (
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="live-dot size-2 rounded-full bg-[--gain]" aria-hidden />
                Live · market open
              </span>
            ) : null}
            {data.allTime ? (
              <span className="text-xs text-muted-foreground" title={`Across the ${Math.round(data.allTime.coverage * 100)}% of your holdings that have an average cost`}>
                Since purchase{" "}
                <span className={cn("numeric font-semibold", data.allTime.amount >= 0 ? "text-gain-ink" : "text-loss-ink")}>
                  {hidden ? formatPercent(data.allTime.percent, 0) : `${signedUsd(data.allTime.amount)} (${formatPercent(data.allTime.percent, 0)})`}
                </span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setHidden(!hidden)} title={hidden ? "Show amounts" : "Hide amounts (returns stay visible)"}>
            {hidden ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
            <span className="sr-only">{hidden ? "Show amounts" : "Hide amounts"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void sync()} loading={syncing}>
            {!syncing ? <RefreshCw aria-hidden /> : null}
            Refresh
          </Button>
        </div>
      </Reveal>

      {/* Three grid items, not two columns: on a phone they stack as return, accounts,
          holdings; on desktop the rail spans both rows beside the main column. */}
      <div className="grid items-start gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_420px]">
        <SectionCard
          label="Return"
          index={1}
          className="lg:col-start-1 lg:row-start-1"
          action={
            rangeOptions.length > 1 ? (
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
            ) : null
          }
        >
          {data.hasHistory ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-5">
                <span className={cn("numeric font-display text-[34px] font-semibold leading-none tracking-tight", shownPercent >= 0 ? "text-gain-ink" : "text-loss-ink")}>
                  {formatPercent(shownPercent)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {hoverIndex != null && shown
                    ? formatDate(shown.date)
                    : windowCoversAll && data.firstDate
                      ? `since ${formatDate(data.firstDate)} · ${plural(data.performance.days, "day")} tracked`
                      : `last ${RANGE_NAMES[range]}`}
                </span>
                <span className="group relative ml-auto inline-flex" tabIndex={0} aria-label={explainer}>
                  <Info className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
                  {/* The long explanation lives behind the icon instead of above the chart. */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-6 z-30 w-64 translate-y-1 rounded-xl border bg-popover p-3 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-[opacity,translate] duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus:translate-y-0 group-focus:opacity-100"
                  >
                    {explainer}
                  </span>
                </span>
              </div>
              <div className="px-2 pb-2 pt-3">
                <PerformanceChart
                  points={series}
                  baseline={100}
                  indexed
                  height={340}
                  onHover={setHoverIndex}
                  ariaLabel={`Time-weighted return over the last ${range}`}
                  valueFormatter={(v) => `${v >= 100 ? "+" : "−"}${Math.abs(v - 100).toFixed(2)}%`}
                />
              </div>
            </>
          ) : (
            /* Being honest beats drawing a line through invented data. */
            <div className="grid min-h-[340px] place-items-center p-5">
              <EmptyState icon={Sparkles} title="Your history starts now" description="We snapshot your portfolio once a day. Check back tomorrow for your first data point." />
            </div>
          )}
        </SectionCard>

        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Reveal index={2}>
            <AccountsCard accounts={data.accounts} items={data.items} hidden={hidden} onChange={refetch} />
          </Reveal>
          {data.leagues.length > 0 ? <LeaguesCard leagues={data.leagues} index={4} /> : null}
          <NewsCard index={5} />
        </div>

        <Reveal index={3} className="lg:col-start-1 lg:row-start-2">
          <HoldingsTable
            holdings={data.holdings}
            allocation={data.allocation}
            hidden={hidden}
            todayLabel={data.today?.asOf && !isToday ? formatDate(`${data.today.asOf}T12:00:00`, "short") : "Today"}
          />
        </Reveal>
      </div>
    </div>
  )
}

function LeaguesCard({ leagues, index }: { leagues: PortfolioResponse["leagues"]; index: number }) {
  return (
    <SectionCard label="Your leagues" href="/leagues" index={index}>
      <ul>
        {leagues.slice(0, 5).map((league, i) => (
          <li key={league.id} className={cn(i > 0 && "border-t")}>
            <Link href={`/leagues/${league.id}`} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary/50">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-lg" aria-hidden>
                {league.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{league.name}</span>
                <span className="block text-xs text-muted-foreground">{plural(league.members, "member")}</span>
              </span>
              {league.rank != null ? (
                <span
                  className={cn(
                    "numeric rounded-lg px-2 py-1 font-display text-sm font-bold",
                    league.rank === 1 ? "bg-[color-mix(in_srgb,var(--rank-1)_16%,transparent)] text-gold-ink" : "bg-secondary text-muted-foreground",
                  )}
                >
                  #{league.rank}
                </span>
              ) : null}
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function NewsCard({ index }: { index: number }) {
  return (
    <SectionCard label="Markets today" index={index} className="surface-hero">
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">The day’s recap, sector moves, sentiment and the earnings coming up for what you hold.</p>
        <Link
          href="/news"
          className="press inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Newspaper className="size-4" aria-hidden />
          Open News
        </Link>
      </div>
    </SectionCard>
  )
}
