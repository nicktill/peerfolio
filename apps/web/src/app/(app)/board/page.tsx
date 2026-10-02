"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ShieldCheck, Trophy, UserPlus, Users } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Delta } from "@web/components/ui/delta"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { SkeletonRow } from "@web/components/ui/skeleton"
import { Sparkline } from "@web/components/ui/sparkline"
import { useToast } from "@web/components/ui/toast"
import { mutate, useApi } from "@web/lib/use-api"
import { RANGES, type Range } from "@web/lib/ranges"
import { revealStyle } from "@web/components/motion/reveal"
import { cn } from "@web/lib/utils"
import { withShownWeights } from "@web/lib/percent-display"

type Trader = {
  handle: string | null
  name: string | null
  image: string | null
  bio: string | null
  rank: number
  percent: number
  days: number
  spark: number[]
  holdings: { ticker: string; name: string | null; weight: number }[]
  isFollowing: boolean
  isYou: boolean
}

type BoardResponse = {
  traders: Trader[]
  minHistoryDays: number
  scope: "all" | "following"
}

const MEDALS = ["var(--rank-1)", "var(--rank-2)", "var(--rank-3)"]

export default function BoardPage() {
  const { toast } = useToast()
  const [range, setRange] = useState<Range>("1M")
  const [scope, setScope] = useState<"all" | "following">("all")

  const { data, loading, refetch } = useApi<BoardResponse>(`/api/board?range=${range}&scope=${scope}`, [range, scope])

  async function toggleFollow(trader: Trader) {
    if (!trader.handle) return
    try {
      await mutate(`/api/users/${trader.handle}/follow`, { method: trader.isFollowing ? "DELETE" : "POST" })
      await refetch()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update.", "error")
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">The Board</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every return here is pulled straight from a connected brokerage and time-weighted, so deposits don&apos;t
          inflate anyone&apos;s number. Percentages only — no balances, ever.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<"all" | "following">
          options={[
            { value: "all", label: "Everyone" },
            { value: "following", label: "Following" },
          ]}
          value={scope}
          onChange={setScope}
          size="sm"
          label="Board scope"
        />
        <Segmented options={RANGES} value={range} onChange={setRange} size="sm" label="Time range" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{scope === "following" ? "Traders you follow" : "Top traders"}</CardTitle>
          <Badge variant="verified">
            <ShieldCheck aria-hidden />
            Verified only
          </Badge>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : data && data.traders.length > 0 ? (
            <ul className="divide-y">
              {data.traders.map((trader, i) => (
                <li
                  key={trader.handle ?? trader.rank}
                  style={revealStyle(Math.min(i, 8))}
                  className={cn("reveal py-3 first:pt-0 last:pb-0", trader.isYou && "surface-you -mx-2 rounded-xl px-3")}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="numeric w-6 shrink-0 text-center text-sm font-bold"
                      style={trader.rank <= 3 ? { color: MEDALS[trader.rank - 1] } : undefined}
                    >
                      {trader.rank}
                    </span>

                    <Avatar src={trader.image} name={trader.name} handle={trader.handle} />

                    <div className="min-w-0 flex-1">
                      {trader.handle ? (
                        <Link href={`/u/${trader.handle}`} className="block truncate text-sm font-medium hover:underline">
                          {trader.name ?? `@${trader.handle}`}
                        </Link>
                      ) : (
                        <span className="block truncate text-sm font-medium">{trader.name ?? "Trader"}</span>
                      )}
                      <p className="truncate text-xs text-muted-foreground">
                        {trader.handle ? `@${trader.handle}` : ""} · {trader.days}d<span className="max-sm:hidden"> tracked</span>
                      </p>
                    </div>

                    <Sparkline points={trader.spark} className="hidden shrink-0 sm:block" />

                    <div className="shrink-0 text-right">
                      <Delta value={trader.percent} variant="plain" />
                    </div>

                    {!trader.isYou ? (
                      <Button
                        variant={trader.isFollowing ? "secondary" : "outline"}
                        size="sm"
                        className="shrink-0 max-sm:size-10 max-sm:px-0"
                        onClick={() => void toggleFollow(trader)}
                        aria-label={trader.isFollowing ? `Unfollow ${trader.name ?? trader.handle}` : `Follow ${trader.name ?? trader.handle}`}
                      >
                        {trader.isFollowing ? <Check aria-hidden className="sm:hidden" /> : <UserPlus aria-hidden />}
                        <span className="max-sm:hidden">{trader.isFollowing ? "Following" : "Follow"}</span>
                      </Button>
                    ) : null}
                  </div>

                  {trader.holdings.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                      {withShownWeights(trader.holdings.slice(0, 5)).map((h) => (
                        <span
                          key={h.ticker}
                          className="numeric rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium"
                          title={`${h.name ?? h.ticker} — ${h.weight.toFixed(1)}% of their portfolio`}
                        >
                          {h.ticker} <span className="text-muted-foreground">{h.shownWeight}%</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : scope === "following" ? (
            <EmptyState
              icon={Users}
              title="You're not following anyone yet"
              description="Follow traders from the Everyone tab to build your own board."
            />
          ) : (
            <EmptyState
              icon={Trophy}
              title="The board is still filling up"
              description={`Traders show up after ${data?.minHistoryDays ?? 7} days of verified history, which needs a linked brokerage. Linking is coming soon. Until then, leagues are where the action is.`}
              action={
                <Button asChild>
                  <Link href="/leagues">Start a league</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
