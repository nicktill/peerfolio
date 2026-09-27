"use client"

import { useState } from "react"
import { Eye, EyeOff, RefreshCw, ShieldCheck, Sparkles, Wallet } from "lucide-react"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Delta } from "@web/components/ui/delta"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { Skeleton, SkeletonStat } from "@web/components/ui/skeleton"
import { StatTile } from "@web/components/ui/stat-tile"
import { useToast } from "@web/components/ui/toast"
import { AllocationBar, type AllocationSlice } from "@web/components/charts/allocation-bar"
import { PerformanceChart } from "@web/components/charts/performance-chart"
import { AccountsCard, type AccountRow, type ItemRow } from "@web/components/dashboard/accounts-card"
import { ConnectButton } from "@web/components/dashboard/connect-button"
import { HoldingsCard, type HoldingRow } from "@web/components/dashboard/holdings-card"
import { ManualAccountForm } from "@web/components/dashboard/manual-account-form"
import { formatCurrency, formatPercent } from "@web/lib/format"
import { mutate, useApi } from "@web/lib/use-api"
import { RANGES, type Range } from "@web/lib/ranges"

type PortfolioResponse = {
  summary: { totalAssets: number; totalLiabilities: number; netWorth: number; investableAssets: number }
  accounts: AccountRow[]
  items: ItemRow[]
  allocation: AllocationSlice[]
  topHoldings: HoldingRow[]
  history: { date: string; netWorth: number; investableAssets: number }[]
  performance: { percent: number; days: number; range: Range; series: { date: string; indexed: number }[] }
  hasHistory: boolean
  isVerified: boolean
}

export default function DashboardPage() {
  const { toast } = useToast()
  const [range, setRange] = useState<Range>("1M")
  const [hidden, setHidden] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const { data, loading, error, refetch } = useApi<PortfolioResponse>(`/api/portfolio?range=${range}`, [range])

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

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-56" />
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonStat key={i} />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  if (error) {
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
                <ManualAccountForm onCreated={refetch} />
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-medium text-muted-foreground">Net worth</h1>
            {data.isVerified ? (
              <Badge variant="verified">
                <ShieldCheck aria-hidden />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline">Self-reported</Badge>
            )}
          </div>
          <p className="numeric mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
            {formatCurrency(data.summary.netWorth, { hidden })}
          </p>
        </div>

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
      </header>

      <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Investing return"
          value={data.hasHistory ? formatPercent(data.performance.percent) : "—"}
          hint={data.hasHistory ? `time-weighted · ${range}` : "needs 2+ days"}
        />
        <StatTile label="Invested" value={formatCurrency(data.summary.investableAssets, { hidden, compact: true })} />
        <StatTile label="Assets" value={formatCurrency(data.summary.totalAssets, { hidden, compact: true })} />
        <StatTile
          label="Liabilities"
          value={formatCurrency(data.summary.totalLiabilities, { hidden, compact: true })}
          hint={`${data.accounts.length} accounts`}
        />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Return</CardTitle>
            {data.hasHistory ? (
              <div className="mt-1.5 flex items-center gap-2">
                <Delta value={data.performance.percent} size="sm" />
                <span className="text-xs text-muted-foreground">over {data.performance.days} days of history</span>
              </div>
            ) : null}
          </div>
          <Segmented options={RANGES} value={range} onChange={setRange} size="sm" label="Time range" />
        </CardHeader>
        <CardContent>
          {data.hasHistory ? (
            <PerformanceChart
              points={series}
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

      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {data.allocation.length > 0 ? (
              <AllocationBar slices={data.allocation} hidden={hidden} />
            ) : (
              <EmptyState icon={Wallet} title="No allocation yet" />
            )}
          </CardContent>
        </Card>

        <HoldingsCard holdings={data.topHoldings} hidden={hidden} />
      </div>

      <AccountsCard accounts={data.accounts} items={data.items} hidden={hidden} onChange={refetch} />
    </div>
  )
}
