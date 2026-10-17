"use client"

import { SampleLink } from "@web/components/sample/sample-link"
import { EmptyGhost } from "@web/components/ui/empty-ghost"
import "@web/components/app-4a.css"
import "@web/components/board/board.css"
import { useState } from "react"
import Link from "next/link"
import { Check, ShieldCheck, Trophy, UserPlus, Users } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Badge } from "@web/components/ui/badge"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Delta } from "@web/components/ui/delta"
import { EmptyState } from "@web/components/ui/empty-state"
import "@web/components/app-4a.css"
import { Segmented } from "@web/components/ui/segmented"
import { SkeletonRow } from "@web/components/ui/skeleton"
import { Sparkline } from "@web/components/ui/sparkline"
import { TickerLogo } from "@web/components/ui/ticker-logo"
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


function HoldingChip({ holding }: { holding: { ticker: string; name: string | null; weight: number; shownWeight: string } }) {
  const fill = Math.min(100, Math.max(0, holding.weight))
  return (
    <span
      className="pf-holding-chip numeric inline-flex items-center gap-1.5 rounded-full border bg-secondary/60 py-0.5 pl-0.5 pr-2.5 text-[10px] font-medium"
      style={{ backgroundImage: `linear-gradient(90deg, hsl(var(--primary) / 0.16) ${fill}%, transparent ${fill}%)` }}
      title={`${holding.name ?? holding.ticker}: ${holding.weight.toFixed(1)}% of their portfolio`}
    >
      <TickerLogo symbol={holding.ticker} size="xs" className="rounded-full border-0 shadow-none" />
      <span className="font-mono font-semibold">{holding.ticker}</span>
      <span className="text-muted-foreground">{holding.shownWeight}%</span>
    </span>
  )
}

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
    <div className="pf-4a min-w-0 space-y-6">
      <header className="pf-4a-heading">
        <h1 className="font-display text-3xl font-normal tracking-tight sm:text-4xl">The Board</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every return here is pulled straight from a connected brokerage and time-weighted, so deposits don&apos;t
          inflate anyone&apos;s number. Percentages only — no balances, ever.
        </p>
      </header>

      <div className="bd-controls">
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

      <Card className="bd-panel rounded-xl">
        <CardHeader className="flex-row items-center justify-between px-[18px]">
          <CardTitle>{scope === "following" ? "Traders you follow" : "Top traders"}</CardTitle>
          <Badge variant="verified">
            <ShieldCheck aria-hidden />
            Verified only
          </Badge>
        </CardHeader>
        <CardContent className={data && data.traders.length > 0 ? "p-0 pb-2" : undefined}>
          {loading && !data ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : data && data.traders.length > 0 ? (
            <ul className="bd-list">
              {data.traders.map((trader, i) => {
                const label = trader.name ?? (trader.handle ? `@${trader.handle}` : "Trader")
                return (
                  <li
                    key={trader.handle ?? trader.rank}
                    style={revealStyle(Math.min(i, 8))}
                    className={cn("reveal bd-row", trader.isYou && "bd-you")}
                    data-podium={trader.rank <= 3 ? trader.rank : undefined}
                  >
                    <span className="numeric pf-rank bd-rank font-bold" data-rank={trader.rank}>
                      {trader.rank}
                    </span>

                    <Avatar src={trader.image} name={trader.name} handle={trader.handle} />

                    <div className="bd-who">
                      <p className="bd-name">
                        {trader.handle ? (
                          <Link href={`/u/${trader.handle}`} className="hover:underline">
                            {label}
                          </Link>
                        ) : (
                          <span>{label}</span>
                        )}
                        {trader.isYou ? <span className="bd-you-tag">you</span> : null}
                        {trader.rank === 1 ? <span className="bd-leader">Leader</span> : null}
                      </p>
                      <span className="bd-handle">
                        {trader.handle ? `@${trader.handle} · ` : ""}
                        {trader.days}d<span className="max-sm:hidden"> tracked</span>
                      </span>
                    </div>

                    <div className="bd-chips">
                      {trader.holdings.length > 0 ? (
                        withShownWeights(trader.holdings.slice(0, 5)).map((h, n) => <HoldingChip key={`${h.ticker}-${n}`} holding={h} />)
                      ) : (
                        <span className="bd-none">Nothing held yet</span>
                      )}
                    </div>

                    <Sparkline points={trader.spark} className="bd-spark max-sm:hidden" />

                    <div className="bd-ret">
                      <Delta value={trader.percent} variant="plain" />
                    </div>

                    <div className="bd-act">
                      {!trader.isYou ? (
                        <Button
                          variant={trader.isFollowing ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => void toggleFollow(trader)}
                          aria-label={trader.isFollowing ? `Unfollow ${label}` : `Follow ${label}`}
                        >
                          {trader.isFollowing ? <Check aria-hidden className="hidden max-[640px]:block" /> : <UserPlus aria-hidden />}
                          <span className="max-[640px]:hidden">{trader.isFollowing ? "Following" : "Follow"}</span>
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : scope === "following" ? (
            <EmptyState
              icon={Users}
              title="You're not following anyone yet"
              description="Follow traders from the Everyone tab to build your own board."
            />
          ) : (
            <EmptyGhost
              kind="board"
              icon={Trophy}
              title="The board is still filling up"
              body={`Traders show up after ${data?.minHistoryDays ?? 7} days of verified history, which needs a linked brokerage. Until then, leagues are where the action is.`}
              actions={
                <>
                  <Button asChild>
                    <Link href="/leagues?create=1">Start a league</Link>
                  </Button>
                  <SampleLink href="/board/sample" />
                </>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
