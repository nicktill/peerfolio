/** Pure helpers for the admin sports health page: staleness warnings and run-note parsing. No database access here. */

export type Level = "ok" | "warn" | "bad"

export type Staleness = { level: Level; ageMs: number | null; message: string }

/** How old each job may get before it is flagged. GitHub's schedule is best effort, so the limits are generous. */
export const STALE_LIMITS = {
  publish: { warnMs: 45 * 60_000, badMs: 3 * 3600_000 },
  settle: { warnMs: 90 * 60_000, badMs: 4 * 3600_000 },
  worker: { warnMs: 10 * 60_000, badMs: 60 * 60_000 },
} as const

export function staleness(job: keyof typeof STALE_LIMITS, last: Date | string | null | undefined, now: Date): Staleness {
  if (!last) return { level: "bad", ageMs: null, message: "Never ran" }
  const ageMs = Math.max(0, now.getTime() - new Date(last).getTime())
  const { warnMs, badMs } = STALE_LIMITS[job]
  const level: Level = ageMs >= badMs ? "bad" : ageMs >= warnMs ? "warn" : "ok"
  return { level, ageMs, message: level === "ok" ? "On time" : `Last ran ${formatAge(ageMs)} ago` }
}

export function formatAge(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return "under a minute"
  if (min < 90) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h}h ${min % 60}m`
  return `${Math.floor(h / 24)}d`
}

export type RunNotes = { sport: string; notes: string[] }

/** Exchange publish notes that mention a hidden market ("hidden: moneyline: price outside range x1; e.g. ..."), one entry per sport. */
export function hiddenSkips(rows: RunNotes[]): { sport: string; detail: string }[] {
  const out: { sport: string; detail: string }[] = []
  for (const row of rows) {
    for (const note of row.notes) {
      const at = note.indexOf("hidden:")
      if (at >= 0) out.push({ sport: row.sport, detail: note.slice(at + "hidden:".length).trim().slice(0, 300) })
    }
  }
  return out
}

export type StuckPick = { pickId: string; acceptedAt: Date | string; eventStatus: string; finalFirstSeenAt: Date | string | null }

/** Open picks on finished games, oldest first, with their age and a level (a settle should clear them within hours). */
export function stuckPickRows(rows: StuckPick[], now: Date) {
  return rows
    .map((r) => {
      const ageMs = Math.max(0, now.getTime() - new Date(r.acceptedAt).getTime())
      const sinceFinal = r.finalFirstSeenAt ? Math.max(0, now.getTime() - new Date(r.finalFirstSeenAt).getTime()) : null
      const level: Level = sinceFinal != null && sinceFinal > 12 * 3600_000 ? "bad" : sinceFinal != null && sinceFinal > 7 * 3600_000 ? "warn" : "ok"
      return { ...r, ageMs, sinceFinalMs: sinceFinal, level }
    })
    .sort((a, b) => b.ageMs - a.ageMs)
}

/** Share of attempts by outcome/reason, biggest first. */
export function tally<T extends string | null>(values: T[]): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v ?? "none", (counts.get(v ?? "none") ?? 0) + 1)
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}
