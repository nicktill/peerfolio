"use client"

import { useState } from "react"
import Link from "next/link"
import { Clock, Infinity as Forever, Plus, Users } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Delta } from "@web/components/ui/delta"
import { Skeleton } from "@web/components/ui/skeleton"
import { revealStyle } from "@web/components/motion/reveal"
import { useToast } from "@web/components/ui/toast"
import { mutate, useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import { timeLeft } from "@web/components/fantasy/time-left"

type FantasySummary = {
  id: string
  name: string
  emoji: string
  accent: string
  endsAt: string | null
  isClosed: boolean
  memberCount: number
  yourReturn: number
}

const ACCENTS: Record<string, string> = {
  emerald: "from-emerald-500/20",
  violet: "from-violet-500/20",
  amber: "from-amber-500/20",
  sky: "from-sky-500/20",
  rose: "from-rose-500/20",
}

export default function FantasyPage() {
  const { data, loading, refetch } = useApi<{ leagues: FantasySummary[] }>("/api/fantasy")
  const [mode, setMode] = useState<"none" | "create" | "join">("none")

  return (
    <div className="space-y-6">
      <header className="reveal relative overflow-hidden rounded-3xl border bg-card p-6 sm:p-8" style={revealStyle(0)}>
        <div className="hero-grid absolute inset-0 opacity-70" aria-hidden />
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <span aria-hidden className="absolute -bottom-6 right-4 select-none text-[7rem] leading-none opacity-20 sm:text-[9rem]">
          🏈
        </span>
        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
            Play money
          </span>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight">Fantasy leagues. Draft day for stocks.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Everyone starts with the same cash. Pick your stocks, trash-talk your friends, and find out who actually
            knows what they&apos;re doing.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setMode(mode === "create" ? "none" : "create")}>
              <Plus aria-hidden />
              Start a league
            </Button>
            <Button variant="outline" onClick={() => setMode(mode === "join" ? "none" : "join")}>
              Join with a code
            </Button>
          </div>
        </div>
      </header>

      {mode === "create" ? <CreateForm onCancel={() => setMode("none")} /> : null}
      {mode === "join" ? <JoinForm onDone={() => { setMode("none"); void refetch() }} /> : null}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : data && data.leagues.length > 0 ? (
        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">
          {data.leagues.map((league, i) => (
            <Link
              key={league.id}
              href={`/fantasy/${league.id}`}
              style={revealStyle(i + 1)}
              className="reveal press group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent", ACCENTS[league.accent] ?? ACCENTS.emerald)} aria-hidden />
              <div className="relative flex items-start gap-3">
                <span className="text-3xl transition-transform group-hover:scale-110" aria-hidden>
                  {league.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">{league.name}</h2>
                  <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden />
                      <span className="numeric">{league.memberCount}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {league.endsAt ? <Clock className="size-3.5" aria-hidden /> : <Forever className="size-3.5" aria-hidden />}
                      {league.isClosed ? "Final" : league.endsAt ? timeLeft(league.endsAt) : "All-time"}
                    </span>
                  </p>
                </div>
                <Delta value={league.yourReturn} size="sm" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No fantasy leagues yet. Start one and drop the link in the group chat.
        </p>
      )}
    </div>
  )
}

const EMOJIS = ["🏈", "🏀", "⚾", "🥊", "🎰", "🚀", "🦍", "💎"]
const CASH = [10_000, 100_000, 1_000_000]
const DURATIONS = [
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
  { label: "All-time", days: null },
] as const
const CAPS = [
  { label: "No cap", value: null },
  { label: "25%", value: 25 },
  { label: "10%", value: 10 },
] as const

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-secondary",
      )}
    >
      {children}
    </button>
  )
}

function CreateForm({ onCancel }: { onCancel: () => void }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("🏈")
  const [cash, setCash] = useState(100_000)
  const [days, setDays] = useState<number | null>(30)
  const [cap, setCap] = useState<number | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const result = await mutate<{ league: { id: string } }>("/api/fantasy", {
        body: {
          name,
          emoji,
          startingCash: cash,
          maxPositionPct: cap,
          endsAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
        },
      })
      window.location.href = `/fantasy/${result.league.id}`
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't create that league.", "error")
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="animate-rise-in space-y-5 rounded-2xl border bg-card p-5">
      <div className="space-y-1.5">
        <label htmlFor="fantasy-name" className="text-xs font-medium text-muted-foreground">
          League name
        </label>
        <input
          id="fantasy-name"
          required
          minLength={2}
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wolves of Main Street"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        />
      </div>
      <Row label="Icon">
        {EMOJIS.map((e) => (
          <Choice key={e} active={emoji === e} onClick={() => setEmoji(e)}>
            <span className="text-lg leading-none">{e}</span>
          </Choice>
        ))}
      </Row>
      <Row label="Starting cash (same for everyone)">
        {CASH.map((c) => (
          <Choice key={c} active={cash === c} onClick={() => setCash(c)}>
            ${c.toLocaleString()}
          </Choice>
        ))}
      </Row>
      <Row label="How long">
        {DURATIONS.map((d) => (
          <Choice key={d.label} active={days === d.days} onClick={() => setDays(d.days)}>
            {d.label}
          </Choice>
        ))}
      </Row>
      <Row label="Biggest single pick">
        {CAPS.map((c) => (
          <Choice key={c.label} active={cap === c.value} onClick={() => setCap(c.value)}>
            {c.label}
          </Choice>
        ))}
      </Row>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Create league
        </Button>
      </div>
    </form>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  )
}

function JoinForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const [code, setCode] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await mutate("/api/fantasy/join", { body: { code } })
      toast("You're in. Go make some picks.", "success")
      onDone()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't join.", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="animate-rise-in flex gap-2 rounded-2xl border bg-card p-4">
      <input
        aria-label="Invite code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="INVITE CODE"
        className="numeric h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 font-mono text-sm tracking-widest"
      />
      <Button type="submit" loading={saving}>
        Join
      </Button>
    </form>
  )
}
