import { DELAYED_MAX_MS } from "./freshness.ts"

/**
 * Health of the live odds pipeline, classified like lib/sports/health.ts: a status plus the HTTP status a probe
 * should see (503 only for "down"). Pure.
 *
 *  - down: live games exist and the worker is missing/silent, or no live game has a fresh quote,
 *          or the worker has failed too many cycles in a row.
 *  - degraded: some live games have no fresh quote, some are unmatched, the worker had a few failures,
 *          or the worker is silent while nothing is live (nothing is hurt yet, but it should be running).
 *  - ok: everything live is fresh and matched, or nothing is live and the worker is beating.
 */

/** Row key of the single worker in `live_worker`. */
export const WORKER_NAME = "live-odds"

/** The worker beats every 10s when busy and 30s when idle. */
export const WORKER_SILENT_MS = 90_000
export const FAIL_DEGRADED = 3
export const FAIL_DOWN = 6

export type HealthGame = {
  eventId: string
  label: string
  sport: string
  /** Newest live_quote fetched_ts for the game, any source. */
  newestQuoteAt: Date | null
  newestStateAt: Date | null
}

export type HealthInput = {
  worker: { lastCycleAt: Date; lastOkAt: Date | null; consecutiveFailures: number; details: Record<string, unknown> } | null
  /** Games that should be on the field now (the worker's live slate). */
  liveGames: HealthGame[]
}

export type LiveHealth = {
  status: "ok" | "degraded" | "down"
  httpStatus: 200 | 503
  reasons: string[]
  worker: { lastCycleAgeMs: number | null; consecutiveFailures: number }
  games: { eventId: string; label: string; sport: string; quoteAgeMs: number | null; stateAgeMs: number | null; fresh: boolean; unmatched: boolean }[]
  unmatched: { eventId: string; label: string; reason: string }[]
}

export function liveHealth(input: HealthInput, now: Date): LiveHealth {
  const reasons: string[] = []
  let status = "ok" as LiveHealth["status"]
  const bump = (to: "degraded" | "down", why: string) => {
    reasons.push(why)
    if (to === "down" || status === "ok") status = to
  }

  const w = input.worker
  const live = input.liveGames.length > 0
  const cycleAge = w ? now.getTime() - w.lastCycleAt.getTime() : null
  // An idle worker sleeps up to 15 minutes on purpose and records when it will wake (details.sleepUntil): silent means
  // overdue by more than WORKER_SILENT_MS past that, not merely quiet.
  const sleepUntil = typeof w?.details.sleepUntil === "string" ? new Date(w.details.sleepUntil) : null
  const due = w ? (sleepUntil && !Number.isNaN(sleepUntil.getTime()) ? sleepUntil.getTime() : w.lastCycleAt.getTime()) : null
  // Quiet mode: only open picks ride on the live games and nobody is watching, so the worker keeps them in memory (settle triggers
  // still fire) and does not write quotes or heartbeats until it announced wake time (details.sleepUntil). Not a fault.
  const quiet = w?.details.quiet === true
  // With games on the field the worker must be beating every cycle, whatever it said about sleeping (unless it announced quiet mode).
  const silent = due == null || cycleAge == null || (live && !quiet ? cycleAge > WORKER_SILENT_MS : now.getTime() - due > WORKER_SILENT_MS)
  if (silent) bump(live ? "down" : "degraded", w ? `worker silent for ${Math.round(cycleAge! / 1000)}s (overdue ${Math.round((now.getTime() - due!) / 1000)}s)` : "worker has never reported")
  if (w && w.consecutiveFailures >= FAIL_DOWN) bump("down", `worker failed ${w.consecutiveFailures} cycles in a row`)
  else if (w && w.consecutiveFailures >= FAIL_DEGRADED) bump("degraded", `worker failed ${w.consecutiveFailures} cycles in a row`)

  const unmatchedRaw = Array.isArray(w?.details.unmatched) ? (w!.details.unmatched as { eventId?: string; reason?: string }[]) : []
  const unmatchedIds = new Map(unmatchedRaw.filter((u) => u.eventId).map((u) => [u.eventId!, u.reason ?? "unknown"]))

  const games = input.liveGames.map((g) => {
    const quoteAgeMs = g.newestQuoteAt ? now.getTime() - g.newestQuoteAt.getTime() : null
    const stateAgeMs = g.newestStateAt ? now.getTime() - g.newestStateAt.getTime() : null
    return {
      eventId: g.eventId,
      label: g.label,
      sport: g.sport,
      quoteAgeMs,
      stateAgeMs,
      fresh: quoteAgeMs != null && quoteAgeMs <= DELAYED_MAX_MS,
      unmatched: unmatchedIds.has(g.eventId),
    }
  })
  if (live && !silent && !quiet) {
    const stale = games.filter((g) => !g.fresh)
    if (stale.length === games.length) bump("down", `no live game has a fresh quote (${games.length} live)`)
    else if (stale.length) bump("degraded", `${stale.length} of ${games.length} live games have no fresh quote`)
  }
  const unmatched = games.filter((g) => g.unmatched).map((g) => ({ eventId: g.eventId, label: g.label, reason: unmatchedIds.get(g.eventId)! }))
  if (unmatched.length) bump("degraded", `${unmatched.length} live game(s) unmatched on the exchange`)

  return {
    status,
    httpStatus: status === "down" ? 503 : 200,
    reasons,
    worker: { lastCycleAgeMs: cycleAge, consecutiveFailures: w?.consecutiveFailures ?? 0 },
    games,
    unmatched,
  }
}

/**
 * Worker-side: a cycle that threw, or had live games and tried (or was blocked by backoff from trying) upstream
 * calls but got no success, is a total failure. A live slate with nothing to call (a sport with no exchange series)
 * is not a failure.
 */
export function cycleFailed(r: { threw: boolean; slate: number; okCalls: number; failCalls: number; skippedBackoff: number }): boolean {
  return r.threw || (r.slate > 0 && r.okCalls === 0 && (r.failCalls > 0 || r.skippedBackoff > 0))
}

/** Worker-side: exit non-zero (so a supervisor restarts it) after this many total failures in a row (~1 minute at 10s). */
export const EXIT_AFTER_FAILURES = 6
export const shouldExit = (consecutiveFailures: number): boolean => consecutiveFailures >= EXIT_AFTER_FAILURES
