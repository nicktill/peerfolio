"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Users } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"
import { Skeleton } from "@web/components/ui/skeleton"
import { revealStyle } from "@web/components/motion/reveal"
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Leagues</h1>
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

      {mode === "create" ? <CreateLeagueForm onDone={() => { setMode("none"); void refetch() }} /> : null}
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
              className="reveal press group relative overflow-hidden rounded-xl border bg-card p-5 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70",
                  ACCENTS[league.accent] ?? ACCENTS.emerald,
                )}
                aria-hidden
              />
              <div className="relative">
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden>
                    {league.emoji}
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
                  <span className="numeric">{league.memberCount}</span>
                  {league.role === "owner" ? <span className="ml-2">· You run this one</span> : null}
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

const EMOJI_CHOICES = ["🏆", "📈", "🐂", "🎯", "🧠", "🍀", "⚡", "🦈"]
const ACCENT_CHOICES = ["emerald", "violet", "amber", "sky", "rose"] as const

function CreateLeagueForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", emoji: "🏆", accent: "emerald" })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await mutate("/api/leagues", {
        body: { ...form, description: form.description.trim() || undefined },
      })
      toast("League created.", "success")
      onDone()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't create that league.", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
      <div className="space-y-1.5">
        <label htmlFor="league-name" className="text-xs font-medium text-muted-foreground">
          League name
        </label>
        <input
          id="league-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="The Group Chat"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="league-desc" className="text-xs font-medium text-muted-foreground">
          Description (optional)
        </label>
        <input
          id="league-desc"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Bragging rights only"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Icon</legend>
        <div className="flex flex-wrap gap-1.5">
          {EMOJI_CHOICES.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setForm({ ...form, emoji })}
              aria-pressed={form.emoji === emoji}
              className={cn(
                "h-9 w-9 rounded-lg border text-lg transition-colors",
                form.emoji === emoji ? "border-primary bg-accent" : "hover:bg-secondary",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Colour</legend>
        <div className="flex flex-wrap gap-1.5">
          {ACCENT_CHOICES.map((accent) => (
            <button
              key={accent}
              type="button"
              onClick={() => setForm({ ...form, accent })}
              aria-pressed={form.accent === accent}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                form.accent === accent ? "border-primary bg-accent" : "hover:bg-secondary",
              )}
            >
              {accent}
            </button>
          ))}
        </div>
      </fieldset>

      <Button type="submit" loading={saving}>
        Create league
      </Button>
    </form>
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
