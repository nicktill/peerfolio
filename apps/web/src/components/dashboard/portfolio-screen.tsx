"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, ChevronRight, Eye, EyeOff, RefreshCw, ShieldCheck, Sparkles, Wallet } from "lucide-react"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { SectionLabel } from "@web/components/ui/section-card"
import { Reveal, revealStyle } from "@web/components/motion/reveal"
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
import { formatCurrency, formatDate, formatPercent } from "@web/lib/format"
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

type Metric = "value" | "return"

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
 * The portfolio as one composition: a single overview card (net worth, today,
 * and one chart that switches between dollar value and time-weighted return)
 * beside a quiet, unboxed rail (accounts, the invested/cash split, leagues,
 * news), with every holding in an open section underneath. `demo` swaps the
 * server actions for a note, for the preview route.
 */
export function PortfolioScreen({ useSource, demo = false }: { useSource: PortfolioSource; demo?: boolean }) {
  const { toast } = useToast()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  // Two different questions: what is it worth (dollars, moved by deposits) and how
  // have the investments done (time-weighted, deposits taken out).
  const [metric, setMetric] = useState<Metric>("value")
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

  const available = rangeAvailability(data.firstDate, marketToday())
  const unlockIn = rangeUnlockDays(data.firstDate, marketToday())
  // Only ranges the history can fill are offered; locked ones are described in the
  // footnote under the chart instead of sitting there greyed out.
  const rangeOptions = RANGES.filter((r) => available[r]).map((r) => ({ value: r, label: r }))
  const nextRange = RANGES.filter((r) => !available[r]).sort((a, b) => unlockIn[a] - unlockIn[b])[0]
  const windowCoversAll = range === "ALL" || !available[range]

  // Never draw the dollar line under a percentage or the other way round: each
  // metric gets its own series, readout and footnote, so they can't be confused.
  const isValue = metric === "value"
  const series = isValue
    ? data.history.map((p) => ({ date: p.date, value: p.netWorth }))
    : data.performance.series.map((p) => ({ date: p.date, value: p.indexed }))
  const canChart = data.hasHistory && series.length >= 2
  const shown = canChart ? (hoverIndex != null ? series[hoverIndex] : series[series.length - 1]) : undefined
  const windowLabel = windowCoversAll && data.firstDate ? `since ${formatDate(data.firstDate)}` : `last ${RANGE_NAMES[range]}`

  const netWorthWhole = Math.floor(data.summary.netWorth)
  const cents = Math.round((data.summary.netWorth - netWorthWhole) * 100)
  const marketOpen = isUsMarketOpen(new Date())
  const isToday = data.today?.asOf === marketToday()
  const todayLabel = data.today?.asOf ? (isToday ? "today" : `on ${formatDate(`${data.today.asOf}T12:00:00`, "short")}`) : "today"

  const cash = data.accounts.filter((a) => a.category === "cash").reduce((sum, a) => sum + a.balance, 0)
  const invested = data.summary.investableAssets

  return (
    <div className="space-y-8">
      {error ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm text-muted-foreground">
          <p>Couldn’t refresh your portfolio. Showing the last loaded balances.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : null}

      <Reveal index={0} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionLabel as="span" className="mb-2 block">Your financial picture</SectionLabel>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Portfolio</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {/* Three items, not two columns: phones stack overview, accounts, holdings; on
          desktop the rail runs beside both, so an opened account never leaves a hole. */}
      <div className="grid items-start gap-8 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="reveal overflow-hidden lg:col-start-1 lg:row-start-1" style={revealStyle(1)}>
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Net worth</span>
              {data.today && isToday && marketOpen ? (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="live-dot size-2 rounded-full bg-[--gain]" aria-hidden />
                  Live · market open
                </span>
              ) : null}
            </div>

            <p className="mt-2 font-display text-5xl font-semibold leading-none sm:text-[56px]" style={{ letterSpacing: "-0.035em" }}>
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

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
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
              {data.allTime ? (
                <span className="text-xs text-muted-foreground" title={`Across the ${Math.round(data.allTime.coverage * 100)}% of your holdings that have an average cost`}>
                  Since purchase{" "}
                  <span className={cn("numeric font-semibold", data.allTime.amount >= 0 ? "text-gain-ink" : "text-loss-ink")}>
                    {hidden ? formatPercent(data.allTime.percent, 0) : `${signedUsd(data.allTime.amount)} (${formatPercent(data.allTime.percent, 0)})`}
                  </span>
                </span>
              ) : null}
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <Segmented<Metric>
                options={[
                  { value: "value", label: "Portfolio value" },
                  { value: "return", label: "Investment return" },
                ]}
                value={metric}
                onChange={(m) => {
                  setHoverIndex(null)
                  setMetric(m)
                }}
                size="sm"
                label="Chart"
              />
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
                />
              ) : null}
            </div>

            {canChart && shown ? (
              <>
                <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={cn(
                      "numeric text-2xl font-semibold tracking-tight",
                      !isValue && (shown.value >= 100 ? "text-gain-ink" : "text-loss-ink"),
                    )}
                  >
                    {isValue ? (hidden ? "••••••" : formatCurrency(shown.value)) : formatPercent(shown.value - 100)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {hoverIndex != null
                      ? formatDate(shown.date)
                      : isValue
                        ? `Portfolio value · ${windowLabel}`
                        : `Time-weighted return · ${windowLabel}${windowCoversAll ? ` · ${plural(data.performance.days, "day")} tracked` : ""}`}
                  </span>
                </div>
                {/* Keyed so a metric or range switch fades the new line in instead of morphing between unrelated shapes. */}
                <div key={`${metric}-${range}`} className="swap-in -mx-1 mt-3">
                  <PerformanceChart
                    points={series}
                    height={300}
                    indexed={!isValue}
                    baseline={isValue ? undefined : 100}
                    showTooltip={false}
                    onHover={setHoverIndex}
                    ariaLabel={isValue ? `Portfolio value in dollars over the last ${range}` : `Time-weighted return over the last ${range}`}
                    valueFormatter={(v) => (isValue ? (hidden ? "Hidden" : formatCurrency(v)) : formatPercent(v - 100))}
                  />
                </div>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  {isValue
                    ? "Value includes money you add or withdraw, so it isn’t a measure of how your investments did. Switch to Investment return for that."
                    : "Time-weighted return leaves out money you add or withdraw, so it measures only how your investments did."}
                  {!isValue && nextRange ? ` The ${nextRange} view unlocks in ${plural(unlockIn[nextRange], "day")}.` : ""}
                </p>
              </>
            ) : (
              /* Being honest beats drawing a line through invented data. */
              <div className="grid min-h-[300px] place-items-center">
                <EmptyState icon={Sparkles} title="Your history starts now" description="We snapshot your portfolio once a day. Check back tomorrow for your first data point." />
              </div>
            )}
          </div>
        </Card>

        <aside className="reveal space-y-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-1" style={revealStyle(2)}>
          <AccountsCard variant="rail" accounts={data.accounts} items={data.items} hidden={hidden} onChange={refetch} />

          <section aria-labelledby="rail-glance" className="border-t pt-5">
            <SectionLabel as="h2" id="rail-glance">At a glance</SectionLabel>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Invested</dt>
                <dd className="numeric font-medium">{formatCurrency(invested, { hidden })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cash &amp; savings</dt>
                <dd className="numeric font-medium">{formatCurrency(cash, { hidden })}</dd>
              </div>
              {data.summary.totalLiabilities > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Owed</dt>
                  <dd className="numeric font-medium text-loss-ink">−{formatCurrency(data.summary.totalLiabilities, { hidden })}</dd>
                </div>
              ) : null}
            </dl>
            {invested + cash > 0 ? (
              <div
                className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-secondary"
                role="img"
                aria-label={`${Math.round((invested / (invested + cash)) * 100)}% invested, ${Math.round((cash / (invested + cash)) * 100)}% cash`}
              >
                <span className="stat-bar h-full rounded-full bg-primary" style={{ width: `${(invested / (invested + cash)) * 100}%` }} />
              </div>
            ) : null}
          </section>

          {data.leagues.length > 0 ? (
            <section aria-labelledby="rail-leagues" className="border-t pt-5">
              <div className="flex items-center justify-between">
                <SectionLabel as="h2" id="rail-leagues">Your leagues</SectionLabel>
                <Link href="/leagues" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  See all
                </Link>
              </div>
              <ul className="mt-2 divide-y">
                {data.leagues.slice(0, 4).map((league) => (
                  <li key={league.id}>
                    <Link href={`/leagues/${league.id}`} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/50">
                      <span className="text-lg" aria-hidden>{league.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{league.name}</span>
                        <span className="block text-xs text-muted-foreground">{plural(league.members, "member")}</span>
                      </span>
                      {league.rank != null ? (
                        <span className={cn("numeric font-display text-sm font-bold", league.rank === 1 ? "text-gold-ink" : "text-muted-foreground")}>#{league.rank}</span>
                      ) : null}
                      <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Link href="/news" className="group flex items-center justify-between gap-3 border-t pt-5">
            <span>
              <SectionLabel as="span" className="block transition-colors group-hover:text-foreground">Markets today</SectionLabel>
              <span className="mt-1.5 block text-sm text-muted-foreground">Recap, sectors, sentiment and earnings for what you hold.</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </aside>

        <Reveal index={3} className="lg:col-start-1 lg:row-start-2">
          <HoldingsTable
            variant="section"
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
