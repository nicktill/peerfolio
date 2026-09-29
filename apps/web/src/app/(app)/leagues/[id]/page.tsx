"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, LogOut, Share2, Trophy } from "lucide-react"
import { Avatar } from "@web/components/ui/avatar"
import { Button } from "@web/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Segmented } from "@web/components/ui/segmented"
import { Skeleton, SkeletonRow } from "@web/components/ui/skeleton"
import { useToast } from "@web/components/ui/toast"
import { RaceChart } from "@web/components/charts/race-chart"
import { StandingRow, type Standing } from "@web/components/leagues/standing-row"
import { plural } from "@web/lib/plural"
import { mutate, useApi } from "@web/lib/use-api"
import { RANGES, type Range } from "@web/lib/ranges"

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
      // A link, not a code. Asking someone to retype eight characters into a
      // form they have to find first is where the invite loop died.
      await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`)
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

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={Trophy}
            title="Couldn't open this league"
            description="It may have been deleted, or you may no longer be a member."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/leagues">Back to leagues</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

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
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{data.league.name}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {data.league.description || (data.standings.length === 1 ? "Just you so far" : plural(data.standings.length, "member"))}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void copyInvite(data.league.inviteCode)}>
              {copied ? <Check aria-hidden /> : <Share2 aria-hidden />}
              {copied ? "Invite link copied" : "Copy invite link"}
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
          {ranked.some((s) => !s.isVerified) ? (
            <p className="text-xs text-muted-foreground">Returns are self-reported unless a member is verified.</p>
          ) : null}
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
                <StandingRow key={standing.userId} standing={standing} onReact={react} showSource={false} tone="app" />
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
