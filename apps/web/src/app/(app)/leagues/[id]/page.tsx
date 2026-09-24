"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, EyeOff, LogOut, Share2, Trophy } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { Delta } from "@web/components/ui/delta"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { Skeleton, SkeletonRow } from "@web/components/ui/skeleton"
import { Sparkline } from "@web/components/ui/sparkline"
import { useToast } from "@web/components/ui/toast"
import { RaceChart } from "@web/components/charts/race-chart"
import { mutate, useApi } from "@web/lib/use-api"
import { RANGES, type Range } from "@web/lib/ranges"
import { cn } from "@web/lib/utils"

const REACTIONS = ["🔥", "🚀", "👏", "🧊", "🤝", "😤"] as const

type Standing = {
  userId: string
  name: string | null
  handle: string | null
  image: string | null
  rank: number
  percent: number
  days: number
  spark: number[]
  hasHistory: boolean
  shareHoldings: boolean
  holdings: { ticker: string; name: string | null; weight: number }[]
  reactions: Record<string, number>
  isYou: boolean
}

type LeagueResponse = {
  league: { id: string; name: string; description: string | null; emoji: string; inviteCode: string; isOwner: boolean }
  you: { shareHoldings: boolean }
  standings: Standing[]
}

export default function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const [range, setRange] = useState<Range>("1M")
  const [copied, setCopied] = useState(false)

  const { data, loading, refetch } = useApi<LeagueResponse>(`/api/leagues/${id}?range=${range}`, [range, id])

  async function react(toUserId: string, emoji: string) {
    try {
      await mutate(`/api/leagues/${id}/react`, { body: { toUserId, emoji } })
      await refetch()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't react.", "error")
    }
  }

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast("Couldn't copy — the code is on screen.", "error")
    }
  }

  async function toggleSharing(next: boolean) {
    try {
      await mutate(`/api/leagues/${id}`, { method: "PATCH", body: { shareHoldings: next } })
      toast(next ? "Your top tickers are visible to this league." : "Your holdings are hidden.", "success")
      await refetch()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't update.", "error")
    }
  }

  async function leave() {
    if (!window.confirm("Leave this league?")) return
    try {
      await mutate(`/api/leagues/${id}/leave`)
      window.location.href = "/leagues"
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't leave.", "error")
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 rounded-xl" />
        <div className="space-y-2">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    )
  }

  if (!data) return null

  const ranked = data.standings.filter((s) => s.hasHistory)
  const waiting = data.standings.filter((s) => !s.hasHistory)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/leagues"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Leagues
        </Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl" aria-hidden>
              {data.league.emoji}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{data.league.name}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {data.league.description || `${data.standings.length} members`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void copyInvite(data.league.inviteCode)}>
              {copied ? <Check aria-hidden /> : <Share2 aria-hidden />}
              <span className="numeric tracking-widest">{data.league.inviteCode}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void leave()}>
              <LogOut aria-hidden />
              Leave
            </Button>
          </div>
        </header>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={RANGES} value={range} onChange={setRange} size="sm" label="Time range" />
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={data.you.shareHoldings}
            onChange={(e) => void toggleSharing(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Show my top tickers to this league
        </label>
      </div>

      {ranked.length >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>The race</CardTitle>
            <p className="text-xs text-muted-foreground">
              Everyone indexed to 100 at the start of the window, so this compares rates of return — not who has more
              money.
            </p>
          </CardHeader>
          <CardContent>
            <RaceChart
              series={ranked.slice(0, 8).map((s) => ({
                id: s.userId,
                label: s.name?.split(" ")[0] ?? s.handle ?? "Member",
                points: s.spark,
                isYou: s.isYou,
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Standings</CardTitle>
        </CardHeader>
        <CardContent>
          {ranked.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No standings yet"
              description="Returns appear once members have at least two days of history. Snapshots run daily."
            />
          ) : (
            <ul className="divide-y">
              {ranked.map((standing) => (
                <StandingRow key={standing.userId} standing={standing} onReact={react} />
              ))}
            </ul>
          )}

          {waiting.length > 0 ? (
            <div className="mt-5 border-t pt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Building history
              </h4>
              <ul className="flex flex-wrap gap-2">
                {waiting.map((member) => (
                  <li key={member.userId} className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
                    <Avatar src={member.image} name={member.name} handle={member.handle} size="sm" />
                    <span>{member.isYou ? "You" : (member.name ?? member.handle ?? "Member")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

const MEDALS = ["var(--rank-1)", "var(--rank-2)", "var(--rank-3)"]

function StandingRow({
  standing,
  onReact,
}: {
  standing: Standing
  onReact: (toUserId: string, emoji: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <li className={cn("py-3 first:pt-0 last:pb-0", standing.isYou && "-mx-2 rounded-lg bg-accent/40 px-2")}>
      <div className="flex items-center gap-3">
        <span
          className="numeric w-6 shrink-0 text-center text-sm font-bold"
          style={standing.rank <= 3 ? { color: MEDALS[standing.rank - 1] } : undefined}
        >
          {standing.rank}
        </span>

        <Avatar src={standing.image} name={standing.name} handle={standing.handle} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {standing.isYou ? "You" : (standing.name ?? standing.handle ?? "Member")}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {standing.handle ? `@${standing.handle}` : `${standing.days} days`}
          </p>
        </div>

        <Sparkline points={standing.spark} className="hidden shrink-0 sm:block" />

        <div className="shrink-0 text-right">
          <Delta value={standing.percent} size="md" variant="plain" />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-9">
        {standing.shareHoldings && standing.holdings.length > 0 ? (
          standing.holdings.slice(0, 4).map((h) => (
            <span
              key={h.ticker}
              className="numeric rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium"
              title={`${h.name ?? h.ticker} — ${h.weight.toFixed(1)}% of their portfolio`}
            >
              {h.ticker} <span className="text-muted-foreground">{h.weight.toFixed(0)}%</span>
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <EyeOff className="h-3 w-3" aria-hidden />
            Holdings private
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {Object.entries(standing.reactions).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => !standing.isYou && onReact(standing.userId, emoji)}
              disabled={standing.isYou}
              className="numeric inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] transition-transform enabled:hover:scale-105"
            >
              <span aria-hidden>{emoji}</span>
              {count}
            </button>
          ))}

          {!standing.isYou ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="rounded-full border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                aria-expanded={open}
              >
                +
              </button>
              {open ? (
                <div className="absolute bottom-full right-0 z-10 mb-1 flex gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(standing.userId, emoji)
                        setOpen(false)
                      }}
                      className="rounded px-1.5 py-1 text-base transition-transform hover:scale-110"
                    >
                      <span aria-hidden>{emoji}</span>
                      <span className="sr-only">React with {emoji}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}
