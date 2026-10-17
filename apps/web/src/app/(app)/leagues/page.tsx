"use client"

import { LeagueMark } from "@web/components/league/league-mark"
import "@web/components/leagues/league-workspace.css"
import "@web/components/app-4a.css"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Plus, Users } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Skeleton } from "@web/components/ui/skeleton"
import { revealStyle } from "@web/components/motion/reveal"
import { CreateLeagueFlow } from "@web/components/fantasy/create-league-flow"
import { useToast } from "@web/components/ui/toast"
import { mutate, useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"

type LeagueSummary = {
  id: string
  name: string
  description: string | null
  emoji: string
  accent: string
  inviteCode: string
  role: "owner" | "member"
  memberCount: number
}

const ACCENTS: Record<string, string> = {
  emerald: "from-emerald-500/15 to-emerald-500/0",
  violet: "from-violet-500/15 to-violet-500/0",
  amber: "from-amber-500/15 to-amber-500/0",
  sky: "from-sky-500/15 to-sky-500/0",
  rose: "from-rose-500/15 to-rose-500/0",
}

export default function LeaguesPage() {
  const { data, loading, refetch } = useApi<{ leagues: LeagueSummary[] }>("/api/leagues")
  const [mode, setMode] = useState<"none" | "create" | "join">("none")

  // The board's empty state links here with ?create=1 so the form is already open.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("create") === "1") setMode("create")
  }, [])

  return (
    <div className="pf-social pf-4a space-y-7">
      <header className="pf-social-heading flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-normal tracking-tight sm:text-4xl">Leagues</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Private groups ranked on percentage return. Nobody sees anyone&apos;s balances.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode(mode === "join" ? "none" : "join")}>
            Join
          </Button>
          <Button size="sm" onClick={() => setMode(mode === "create" ? "none" : "create")}>
            <Plus aria-hidden />
            New league
          </Button>
        </div>
      </header>

      {mode === "create" ? <CreateLeagueFlow kind="league" onClose={() => setMode("none")} onCreated={() => void refetch()} /> : null}
      {mode === "join" ? <JoinLeagueForm onDone={() => { setMode("none"); void refetch() }} /> : null}

      {loading && !data ? (
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : data && data.leagues.length > 0 ? (
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
          {data.leagues.map((league, i) => (
            <Link
              key={league.id}
              href={`/leagues/${league.id}`}
              style={revealStyle(i + 1)}
              className="pf-social-league reveal group relative overflow-hidden rounded-xl border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div
                className={cn(
                  "pf-social-league-tint pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70",
                  ACCENTS[league.accent] ?? ACCENTS.emerald,
                )}
                aria-hidden
              />
              <div className="relative">
                <div className="pf-league-card-top"><span>Private league</span><span>{league.role === "owner" ? "You run this one" : "Member"}</span></div>
                <div className="flex items-start gap-3">
                  <span className="pf-social-league-icon grid size-11 shrink-0 place-items-center rounded-xl border bg-background text-2xl" aria-hidden>
                    <LeagueMark value={league.emoji} accent={league.accent} size={34} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold">{league.name}</h2>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {league.description || `${league.memberCount} member${league.memberCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  <span className="numeric">{league.memberCount} members</span>
                  <span className="pf-league-card-open">View standings <ArrowUpRight className="size-4" aria-hidden /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={Users}
              title="No leagues yet"
              description="Start one with friends, or join with an invite code. Returns are compared as percentages, so nobody has to reveal what they actually have."
              action={
                <Button onClick={() => setMode("create")}>
                  <Plus aria-hidden />
                  Create your first league
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function JoinLeagueForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const [code, setCode] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await mutate<{ league: { name: string }; alreadyMember: boolean }>("/api/leagues/join", {
        body: { code },
      })
      toast(result.alreadyMember ? `You're already in ${result.league.name}.` : `Joined ${result.league.name}.`, "success")
      onDone()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't join.", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-5">
      <div className="min-w-[200px] flex-1 space-y-1.5">
        <label htmlFor="invite-code" className="text-xs font-medium text-muted-foreground">
          Invite code
        </label>
        <input
          id="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD2345"
          maxLength={12}
          className="numeric h-10 w-full rounded-lg border bg-background px-3 text-sm uppercase tracking-widest"
          autoFocus
        />
      </div>
      <Button type="submit" loading={saving}>
        Join league
      </Button>
    </form>
  )
}
