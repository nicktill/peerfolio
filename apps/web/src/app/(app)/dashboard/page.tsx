"use client"

import { useState } from "react"
import { ArrowUpRight, Eye, EyeOff, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Wallet } from "lucide-react"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Delta } from "@web/components/ui/delta"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { Skeleton, SkeletonStat } from "@web/components/ui/skeleton"
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

const FOLLOWING = [
  { name: "Maya Chen", handle: "@mayac", return: "+18.4%", note: "Added to NVDA" },
  { name: "Theo Brooks", handle: "@theob", return: "+11.2%", note: "Joined Long View" },
  { name: "Aisha Patel", handle: "@aishap", return: "+7.8%", note: "Trimmed energy" },
]

export default function DashboardPage() {
  const { toast } = useToast()
  const [range, setRange] = useState<Range>("1M")
  const [hidden, setHidden] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const { data, loading, error, refetch } = useApi<PortfolioResponse>(`/api/portfolio?range=${range}`, [range])

  async function sync() {
    setSyncing(true)
    try { await mutate("/api/sync"); toast("Accounts refreshed.", "success"); await refetch() }
    catch (err) { toast(err instanceof Error ? err.message : "Couldn’t refresh.", "error") }
    finally { setSyncing(false) }
  }

  if (loading && !data) return <div className="flex flex-col gap-6"><Skeleton className="h-16 w-64" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <SkeletonStat key={i} />)}</div><Skeleton className="h-80 rounded-xl" /></div>
  if (error) return <Card><CardContent className="pt-5"><EmptyState icon={Wallet} title="Couldn’t load your portfolio" description={error} action={<Button onClick={() => void refetch()}>Try again</Button>} /></CardContent></Card>
  if (!data) return null
  if (data.accounts.length === 0) return <Card><CardContent className="pt-5"><EmptyState icon={Sparkles} title="Let’s see your portfolio" description="Add an account and start your track record. You can keep dollar amounts private while still comparing returns with friends." action={<div className="flex flex-wrap justify-center gap-2"><ManualAccountForm onCreated={refetch} /><ConnectButton onConnected={refetch} /></div>} /></CardContent></Card>

  const series = data.performance.series.map((p) => ({ date: p.date, value: p.indexed }))

  return (
    <div className="flex flex-col gap-8 animate-rise-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Good morning, Alex</p>
          <div className="mt-2 flex items-center gap-2"><h1 className="numeric text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{formatCurrency(data.summary.netWorth, { hidden })}</h1>{data.isVerified ? <Badge variant="verified"><ShieldCheck aria-hidden /> Verified</Badge> : <Badge variant="outline">Self-reported</Badge>}</div>
          <div className="mt-2 flex items-center gap-2"><Delta value={data.performance.percent} size="sm" /><span className="text-sm text-muted-foreground">investing return · {range}</span></div>
        </div>
        <div className="flex items-center gap-2"><Button variant="ghost" size="icon" onClick={() => setHidden(!hidden)} aria-label={hidden ? "Show balances" : "Hide balances"}>{hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}</Button><Button variant="outline" size="sm" onClick={() => void sync()} loading={syncing}>{!syncing ? <RefreshCw aria-hidden /> : null} Refresh</Button></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Invested", value: formatCurrency(data.summary.investableAssets, { hidden, compact: true }) }, { label: "Today", value: "+$382.14", delta: "+0.38%" }, { label: "Cash & other", value: formatCurrency(data.summary.totalAssets - data.summary.investableAssets, { hidden, compact: true }) }].map((item) => <div key={item.label} className="border-l-2 border-primary/20 pl-4"><p className="text-sm text-muted-foreground">{item.label}</p><p className="numeric mt-1 text-xl font-semibold">{item.value}</p>{item.delta && <p className="mt-1 text-xs font-medium text-[var(--gain)]">{item.delta} today</p>}</div>)}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b"><div><CardTitle>Performance</CardTitle><p className="mt-1 text-sm text-muted-foreground">Your portfolio, measured by returns</p></div><Segmented options={RANGES} value={range} onChange={setRange} size="sm" label="Time range" /></CardHeader>
        <CardContent className="pt-6">{data.hasHistory ? <PerformanceChart points={series} ariaLabel={`Time-weighted return over the last ${range}`} valueFormatter={(v) => `${v >= 100 ? "+" : "−"}${Math.abs(v - 100).toFixed(2)}%`} /> : <EmptyState icon={Sparkles} title="Your history starts now" description="We snapshot your portfolio once a day. Check back tomorrow for your first data point." />}</CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>People you follow</CardTitle><p className="mt-1 text-sm text-muted-foreground">A quick look at what’s moving</p></div><Button variant="ghost" size="sm">See all <ArrowUpRight data-icon="inline-end" /></Button></CardHeader><CardContent className="grid gap-1">{FOLLOWING.map((person) => <div key={person.handle} className="flex items-center justify-between border-t py-3 first:border-t-0"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold">{person.name.split(" ").map((n) => n[0]).join("")}</div><div><p className="text-sm font-medium">{person.name} <span className="font-normal text-muted-foreground">{person.handle}</span></p><p className="text-xs text-muted-foreground">{person.note}</p></div></div><span className="numeric text-sm font-medium text-[var(--gain)]">{person.return}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>In progress</CardTitle><p className="mt-1 text-sm text-muted-foreground">Your active competitions</p></CardHeader><CardContent className="flex flex-col gap-4"><div className="rounded-lg bg-secondary/70 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Long View</p><p className="mt-1 text-xs text-muted-foreground">18 investors · 42 days left</p></div><TrendingUp className="text-primary" aria-hidden /></div><div className="mt-4 flex items-end justify-between"><div><p className="text-xs text-muted-foreground">Your rank</p><p className="numeric text-2xl font-semibold">#4</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Return</p><p className="numeric text-lg font-semibold text-[var(--gain)]">+6.42%</p></div></div></div><Button variant="outline" className="w-full">Open competition <ArrowUpRight data-icon="inline-end" /></Button></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Allocation</CardTitle></CardHeader><CardContent>{data.allocation.length > 0 ? <AllocationBar slices={data.allocation} hidden={hidden} /> : <EmptyState icon={Wallet} title="No allocation yet" />}</CardContent></Card><HoldingsCard holdings={data.topHoldings} hidden={hidden} /></div>
      <AccountsCard accounts={data.accounts} items={data.items} hidden={hidden} onChange={refetch} />
    </div>
  )
}
