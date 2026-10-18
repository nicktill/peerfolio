"use client"

import { AlertTriangle, CheckCircle2, HeartPulse, RefreshCw } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card } from "@web/components/ui/card"
import { StatTile } from "@web/components/ui/stat-tile"
import { useApi } from "@web/lib/use-api"
import { cn } from "@web/lib/utils"
import { formatAge, type Level } from "@web/lib/sports/health-report"

type Job = { job: "publish" | "settle" | "worker"; lastAt: string | null; lastOkAt: string | null; failures: number; details: Record<string, unknown> | null; level: Level; ageMs: number | null; message: string }
type Data = {
  now: string
  mode: string
  jobs: Job[]
  events: { status: string; n: number; final_seen: number; past: number }[]
  stuckPicks: { pickId: string; acceptedAt: string; eventStatus: string; ageMs: number; sinceFinalMs: number | null; level: Level }[]
  picks: { status: string; n: number }[]
  parlays: { status: string; n: number; lastAt: string | null }[] | null
  liveTests: { recent: { requestedAt: string; outcome: string; reason: string | null; quoteAgeMs: number | null; stateAgeMs: number | null; price: number }[]; byReason: { key: string; count: number }[] } | null
  usage: { provider: string; day: string; credits: number }[]
  notifications: { kind: string; n: number; pending: number }[]
  hidden: { sport: string; detail: string }[]
  errors: Record<string, string>
}

const JOB_LABEL = { publish: "Publish (lines)", settle: "Settle (results)", worker: "Live odds worker" } as const
const TONE: Record<Level, string> = { ok: "text-gain-ink", warn: "text-amber-600 dark:text-amber-400", bad: "text-loss-ink" }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      <Card className="space-y-3 p-4">{children}</Card>
    </section>
  )
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never")

export default function SportsHealthPage() {
  const { data, error, loading, refetch } = useApi<Data>("/api/admin/sports-health", [], { refreshMs: 60_000 })
  const bad = data?.jobs.filter((j) => j.level !== "ok") ?? []
  const stuckBad = data?.stuckPicks.filter((p) => p.level !== "ok") ?? []

  return (
    <main className="mx-auto w-full max-w-5xl space-y-7 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight"><HeartPulse aria-hidden className="size-6" />Sports health</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Job freshness, game and pick backlogs, live attempts and provider credits. Refreshes every minute.</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => void refetch()} aria-label="Refresh" title="Refresh"><RefreshCw aria-hidden className={cn("size-4", loading && "animate-spin")} /></Button>
      </div>

      {error ? <p role="alert" className="text-sm text-loss-ink">{error}</p> : null}
      {loading && !data ? <p role="status" className="text-sm text-muted-foreground">Loading…</p> : null}

      {data ? (
        <>
          {bad.length || stuckBad.length ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-loss/40 bg-loss/10 p-4 text-sm text-loss-ink">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {[...bad.map((j) => `${JOB_LABEL[j.job]}: ${j.message}`), stuckBad.length ? `${stuckBad.length} open pick${stuckBad.length === 1 ? "" : "s"} waiting a long time after the game ended` : ""].filter(Boolean).join(" · ")}
              </span>
            </div>
          ) : null}
          {Object.keys(data.errors).length ? (
            <p className="text-xs text-muted-foreground">Some sections could not load: {Object.entries(data.errors).map(([k, v]) => `${k} (${v})`).join("; ")}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {data.jobs.map((j) => (
              <StatTile
                key={j.job}
                label={JOB_LABEL[j.job]}
                value={<span className={cn("flex items-center gap-1.5 text-xl", TONE[j.level])}>{j.level === "ok" ? <CheckCircle2 aria-hidden className="size-5" /> : <AlertTriangle aria-hidden className="size-5" />}{j.ageMs == null ? "Never" : `${formatAge(j.ageMs)} ago`}</span>}
                hint={j.lastAt ? `${when(j.lastAt)}${j.failures ? ` · ${j.failures} failures in a row` : ""}` : "no heartbeat recorded yet"}
                className={j.level === "bad" ? "border-loss/50" : undefined}
              />
            ))}
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">Publish and settle run from the GitHub schedule, which often starts hours late. Sports mode: {data.mode}.</p>

          <Section title="Games by status (last 14 days)">
            {data.events.length ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {data.events.map((e) => (
                  <li key={e.status} className="rounded-xl bg-secondary/50 px-3 py-2.5">
                    <p className="text-xs capitalize text-muted-foreground">{e.status}</p>
                    <p className="numeric font-display text-lg font-semibold">{e.n}</p>
                    {e.status === "scheduled" && e.past > 0 ? <p className="text-xs text-amber-600 dark:text-amber-400">{e.past} started over 6h ago · {e.final_seen} final seen</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No games.</p>}
          </Section>

          <Section title="Open picks on finished games">
            {data.stuckPicks.length ? (
              <ul className="divide-y text-sm">
                {data.stuckPicks.map((p) => (
                  <li key={p.pickId + p.acceptedAt} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="numeric text-muted-foreground">{p.pickId}</span>
                    <span>Placed {formatAge(p.ageMs)} ago</span>
                    <span className={TONE[p.level]}>{p.sinceFinalMs == null ? "final not seen yet" : `final seen ${formatAge(p.sinceFinalMs)} ago`}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">None. Every finished game picks are settled.</p>}
            <p className="text-xs text-muted-foreground">Picks status totals: {data.picks.map((p) => `${p.status} ${p.n}`).join(", ") || "none"}. Parlays: {data.parlays === null ? "table not available" : data.parlays.map((p) => `${p.status} ${p.n}`).join(", ") || "none"}.</p>
          </Section>

          <Section title="Markets hidden by the last publish">
            {data.hidden.length ? (
              <ul className="space-y-1.5 text-sm">
                {data.hidden.map((h, i) => <li key={i}><span className="mr-2 font-medium uppercase">{h.sport}</span><span className="text-muted-foreground">{h.detail}</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nothing hidden in the last recorded publish run (or none recorded yet).</p>}
          </Section>

          <Section title="Live pick attempts">
            {data.liveTests === null ? <p className="text-sm text-muted-foreground">Not available yet.</p> : data.liveTests.recent.length ? (
              <>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {data.liveTests.byReason.map((r) => <li key={r.key}>{r.key} <span className="numeric font-medium text-foreground">{r.count}</span></li>)}
                </ul>
                <ul className="divide-y text-sm">
                  {data.liveTests.recent.slice(0, 15).map((t, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span className="text-muted-foreground">{when(t.requestedAt)}</span>
                      <span className={t.outcome === "rejected" ? "text-loss-ink" : undefined}>{t.outcome}{t.reason ? `: ${t.reason}` : ""}</span>
                      <span className="numeric text-xs text-muted-foreground">quote {t.quoteAgeMs ?? "–"}ms · state {t.stateAgeMs ?? "–"}ms</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="text-sm text-muted-foreground">No attempts recorded.</p>}
          </Section>

          <Section title="Provider credits (last 7 days)">
            {data.usage.length ? (
              <ul className="divide-y text-sm">
                {data.usage.map((u) => <li key={u.provider + u.day} className="flex justify-between py-1.5"><span className="capitalize">{u.provider}</span><span className="text-muted-foreground">{u.day}</span><span className="numeric">{u.credits}</span></li>)}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No credits spent. The free exchange source is in use.</p>}
            <p className="text-xs text-muted-foreground">Notifications (7 days): {data.notifications.map((n) => `${n.kind} ${n.n}${n.pending ? ` (${n.pending} undelivered)` : ""}`).join(", ") || "none"}.</p>
          </Section>
        </>
      ) : null}
    </main>
  )
}
