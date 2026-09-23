"use client"

import { use, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSession } from "next-auth/react"
import { ArrowLeft, ShieldCheck, UserPlus } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Delta } from "@web/components/ui/delta"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { Skeleton } from "@web/components/ui/skeleton"
import { useToast } from "@web/components/ui/toast"
import { PerformanceChart } from "@web/components/charts/performance-chart"
import { mutate, useApi } from "@web/lib/use-api"
import { RANGES, type Range } from "@web/lib/ranges"
import { formatPercent } from "@web/lib/format"

type ProfileResponse = {
  profile: {
    handle: string
    name: string | null
    image: string | null
    bio: string | null
    followers: number
    isFollowing: boolean
    isYou: boolean
  }
  performance: {
    percent: number
    days: number
    series: { date: string; indexed: number }[]
    byRange: Record<string, number>
  }
  holdings: { ticker: string; name: string | null; weight: number }[]
}

export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params)
  const { status } = useSession()
  const { toast } = useToast()
  const [range, setRange] = useState<Range>("3M")

  const { data, loading, error, refetch } = useApi<ProfileResponse>(`/api/users/${handle}?range=${range}`, [
    range,
    handle,
  ])

  async function toggleFollow() {
    if (!data) return
    try {
      await mutate(`/api/users/${handle}/follow`, { method: data.profile.isFollowing ? "DELETE" : "POST" })
      await refetch()
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update.", "error")
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href={status === "authenticated" ? "/board" : "/"} className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={24} height={24} className="rounded-md" />
            <span className="text-sm font-semibold">Peerfolio</span>
          </Link>
          {status === "authenticated" ? (
            <Link
              href="/board"
              className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Board
            </Link>
          ) : (
            <Button size="sm" className="ml-auto" asChild>
              <Link href="/">Join Peerfolio</Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {loading && !data ? (
          <>
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </>
        ) : error ? (
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={ShieldCheck}
                title="Profile not available"
                description="This trader hasn't made their profile public, or the handle doesn't exist."
              />
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-start gap-4">
              <Avatar src={data.profile.image} name={data.profile.name} handle={data.profile.handle} size="xl" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {data.profile.name ?? `@${data.profile.handle}`}
                  </h1>
                  <Badge variant="verified">
                    <ShieldCheck aria-hidden />
                    Verified
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">@{data.profile.handle}</p>
                {data.profile.bio ? <p className="mt-2 text-sm">{data.profile.bio}</p> : null}
                <p className="numeric mt-2 text-xs text-muted-foreground">
                  {data.profile.followers} follower{data.profile.followers === 1 ? "" : "s"} ·{" "}
                  {data.performance.days} days tracked
                </p>
              </div>

              {!data.profile.isYou && status === "authenticated" ? (
                <Button variant={data.profile.isFollowing ? "secondary" : "default"} onClick={() => void toggleFollow()}>
                  {!data.profile.isFollowing ? <UserPlus aria-hidden /> : null}
                  {data.profile.isFollowing ? "Following" : "Follow"}
                </Button>
              ) : null}
            </div>

            {/* Returns across every window, so one good month can't stand in for a track record. */}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {RANGES.map((r) => (
                <div key={r} className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{r}</p>
                  <p className="numeric mt-1 text-sm font-semibold">
                    {formatPercent(data.performance.byRange[r] ?? 0, 1)}
                  </p>
                </div>
              ))}
            </div>

            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Growth of 100</CardTitle>
                  <div className="mt-1.5">
                    <Delta value={data.performance.percent} size="sm" />
                  </div>
                </div>
                <Segmented options={RANGES} value={range} onChange={setRange} size="sm" label="Time range" />
              </CardHeader>
              <CardContent>
                {data.performance.series.length >= 2 ? (
                  <PerformanceChart
                    points={data.performance.series.map((p) => ({ date: p.date, value: p.indexed }))}
                    ariaLabel={`Indexed return over the last ${range}`}
                    valueFormatter={(v) => v.toFixed(1)}
                  />
                ) : (
                  <EmptyState icon={ShieldCheck} title="Not enough history for this window" />
                )}
              </CardContent>
            </Card>

            {data.holdings.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Top positions</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Shown as a share of their own portfolio. Position sizes and balances are never disclosed.
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {data.holdings.map((holding) => (
                      <li key={holding.ticker} className="flex items-center gap-3">
                        <span className="numeric flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-bold">
                          {holding.ticker.slice(0, 5)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{holding.name ?? holding.ticker}</span>
                        <div className="flex w-32 shrink-0 items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-[--series-1]"
                              style={{ width: `${Math.min(holding.weight, 100)}%` }}
                            />
                          </div>
                          <span className="numeric w-10 text-right text-xs font-medium">
                            {holding.weight.toFixed(0)}%
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  )
}
