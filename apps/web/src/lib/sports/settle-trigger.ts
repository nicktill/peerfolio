import type { Sport } from "./types.ts"

/**
 * Event-driven settlement triggers. Pure decision logic, no I/O.
 *
 * Faster signals than the settle cron (the live worker's game state and exchange prices, the public scoreboard) can only ASK for an
 * immediate, targeted settle pass for one event. They never settle anything: the pass runs the same `settleDueEvents` logic, so the
 * results-provider quorum, the official-final flag, plausibility checks, review rules and the stability window all still apply.
 * A wrong signal costs a few provider reads, never a payout.
 */

/** SPORTS_EVENT_TRIGGER=0 turns every trigger off without a deploy (the cron keeps settling). Read at call time, default on. */
export const eventTriggersEnabled = (): boolean => process.env.SPORTS_EVENT_TRIGGER !== "0"

export type SignalReason = "status_final" | "clock_zero_quiet" | "exchange_decided"
/** `final` triggers (a feed says it is over) get a bigger poll budget than `probe` ones (it is probably over). Separate budgets per event. */
export type TriggerKind = "final" | "probe"
export const kindOf = (reason: SignalReason): TriggerKind => (reason === "status_final" ? "final" : "probe")

export const TRIGGER = {
  /** Minimum gap between targeted polls of one event, from the worker's own loop. */
  retryMs: 20_000,
  /** Hard floor between polls of one event across ALL callers (workers, viewers' scoreboard fetches, instances). Enforced in the database. */
  minGapMs: 15_000,
  /** Poll budgets per event and kind, enforced in the database: 30 x 15-20s = about 8 minutes for a final, 8 x 20s for a hunch. */
  maxPolls: { final: 30, probe: 8 } as Record<TriggerKind, number>,
  /** Clock at 0:00 in the last period with the score unchanged for this long. */
  quietMs: 60_000,
  /** Exchange probability for one side at least this high, continuously for this long. */
  decidedProb: 0.99,
  decidedMs: 60_000,
  /** After a series ends (settled, review, budget spent) the same event is not triggered again for this long. */
  cooldownMs: 10 * 60_000,
} as const

export type SignalInput = {
  sport: Sport
  /** The feed's own status for the game. */
  status: "pre" | "live" | "final" | "unknown"
  period: string | null
  clock: string | null
  homeScore: number | null
  awayScore: number | null
  /** Highest moneyline mid among sides, from a fresh two-sided book. Null when no usable book. */
  bestMid: number | null
}

/** Sports whose clock runs down to 0:00 in the final regulation period, and the number of that period. */
const LAST_PERIOD: Partial<Record<Sport, number>> = { nba: 4, nfl: 4, cfb: 4, nhl: 3 }

/** True for "0:00", "00:00", "0.0", "0:00.0", ":00". Anything with time left, or unparseable, is false. */
export function clockIsZero(clock: string | null): boolean {
  if (!clock) return false
  const c = clock.trim()
  if (!/^\d{0,2}[:.]?\d{0,2}(\.\d)?$/.test(c) || !/\d/.test(c)) return false
  return Number(c.replace(/[:.]/g, "")) === 0
}

/** The period number out of "Q4", "4", "P3", "4th", "OT" (which counts as past regulation). Null when unknown. */
export function periodNumber(period: string | null): number | null {
  if (!period) return null
  if (/^(ot|\d?ot|so|shootout)/i.test(period.trim())) return 99
  const m = /\d+/.exec(period)
  return m ? Number(m[0]) : null
}

/** Whether the game looks over by its clock alone: last (or later) regulation period at 0:00 and somebody ahead (no tie that goes to overtime). */
export function clockSaysOver(i: SignalInput): boolean {
  const last = LAST_PERIOD[i.sport]
  if (last == null || i.status === "pre") return false
  const p = periodNumber(i.period)
  if (p == null || p < last || !clockIsZero(i.clock)) return false
  return i.homeScore != null && i.awayScore != null && i.homeScore !== i.awayScore
}

type Track = {
  scoreKey: string
  scoreChangedAt: number
  clockZeroSince: number | null
  decidedSince: number | null
  /** The running series of targeted polls, if any. */
  active: { kind: TriggerKind; startedAt: number; lastFireAt: number; polls: number; inFlight: boolean } | null
  /** No new series before this. */
  coolUntil: number
}

export type TriggerDecision = { fire: SignalReason | null }

/**
 * Per-process memory of the signals for each live event. `observe` is called once per worker tick per event and says whether to
 * call the targeted settle now; `result` feeds back what that call found so the series stops as soon as the game is settled or in
 * review. One poll at a time per event, `retryMs` apart, and a series ends after `maxPolls` (the cron is still the backstop).
 */
export class SettleTriggerTracker {
  private readonly tracks = new Map<string, Track>()

  observe(eventId: string, input: SignalInput, now: number): TriggerDecision {
    let t = this.tracks.get(eventId)
    const key = `${input.homeScore}-${input.awayScore}`
    if (!t) {
      t = { scoreKey: key, scoreChangedAt: now, clockZeroSince: null, decidedSince: null, active: null, coolUntil: 0 }
      this.tracks.set(eventId, t)
    }
    if (key !== t.scoreKey) {
      t.scoreKey = key
      t.scoreChangedAt = now
    }
    // The clock-zero timer restarts whenever the clock leaves 0:00 (a stoppage, overtime) or the score moves.
    if (clockSaysOver(input)) t.clockZeroSince ??= now
    else t.clockZeroSince = null
    if (input.bestMid != null && input.bestMid >= TRIGGER.decidedProb && input.status !== "pre") t.decidedSince ??= now
    else t.decidedSince = null

    let reason: SignalReason | null = null
    if (input.status === "final") reason = "status_final"
    else if (t.clockZeroSince != null && now - Math.max(t.clockZeroSince, t.scoreChangedAt) >= TRIGGER.quietMs) reason = "clock_zero_quiet"
    else if (t.decidedSince != null && now - t.decidedSince >= TRIGGER.decidedMs) reason = "exchange_decided"
    if (!reason) return { fire: null }

    const kind = kindOf(reason)
    const a = t.active
    if (!a) {
      if (now < t.coolUntil) return { fire: null }
      t.active = { kind, startedAt: now, lastFireAt: now, polls: 1, inFlight: true }
      return { fire: reason }
    }
    // A hunch that turns into a feed-confirmed final gets the bigger budget, once.
    if (a.kind === "probe" && kind === "final") {
      t.active = { kind, startedAt: now, lastFireAt: now, polls: 1, inFlight: true }
      return { fire: reason }
    }
    if (a.inFlight || now - a.lastFireAt < TRIGGER.retryMs) return { fire: null }
    if (a.polls >= TRIGGER.maxPolls[a.kind]) {
      t.active = null
      t.coolUntil = now + TRIGGER.cooldownMs
      return { fire: null }
    }
    a.lastFireAt = now
    a.polls++
    a.inFlight = true
    return { fire: reason }
  }

  /** What the targeted pass found. `done` ends the series: the event settled, voided or went to review (nothing more to poll for). */
  result(eventId: string, done: boolean, now: number): void {
    const t = this.tracks.get(eventId)
    if (!t?.active) return
    t.active.inFlight = false
    t.active.lastFireAt = now
    if (done) {
      t.active = null
      t.coolUntil = now + TRIGGER.cooldownMs
    }
  }

  /** Forget events that left the live slate. Call with the ids still on it. */
  prune(keep: Iterable<string>): void {
    const live = new Set(keep)
    for (const id of this.tracks.keys()) if (!live.has(id)) this.tracks.delete(id)
  }

  /** Durable worker recovery; transient requests must be retried after an isolate restart. */
  snapshot(): [string, Track][] {
    return [...this.tracks].map(([id, track]) => [id, structuredClone(track)])
  }

  restore(rows: [string, Track][]): void {
    this.tracks.clear()
    for (const [id, track] of rows.slice(0, 1000)) {
      const copy = structuredClone(track)
      if (copy.active) copy.active.inFlight = false
      this.tracks.set(id, copy)
    }
  }

  size(): number {
    return this.tracks.size
  }
}

export type ClaimState = { at: Date; polls: number }
export type ClaimOptions = { minGapMs: number; maxPolls: number }

/**
 * The shared guard for targeted polls of one event, whoever asks (worker, viewer-driven scoreboard, several instances): at most one
 * per `minGapMs`, at most `maxPolls` per series. `prev` is the stored state (null the first time). The caller stores `polls` and `now`
 * when allowed, under a row lock, so two callers cannot both pass.
 */
export function nextClaim(prev: ClaimState | null, now: Date, opts: ClaimOptions): { ok: true; polls: number } | { ok: false; reason: "too_soon" | "budget_spent" } {
  const polls = prev?.polls ?? 0
  if (polls >= opts.maxPolls) return { ok: false, reason: "budget_spent" }
  if (prev && prev.polls > 0 && now.getTime() - prev.at.getTime() < opts.minGapMs) return { ok: false, reason: "too_soon" }
  return { ok: true, polls: polls + 1 }
}

export const claimName = (kind: TriggerKind, eventId: string) => `settle-${kind}:${eventId}`

/**
 * Which finished scoreboard games should trigger a targeted settle: ESPN says final, we still hold open or locked markets on the game,
 * and either no results source has been seen showing a final yet or that first sighting is recent (a game stuck in review does not
 * keep triggering for as long as it stays on screen). The match is by the provider id, else by names and start time.
 */
export type TriggerEvent = { id: string; sport: string; externalId: string; homeName: string; awayName: string; startsAt: Date; finalFirstSeenAt: Date | null; aliases?: Record<string, string> | null }
export type FinalGame = { id: string; sport: string; home: string; away: string; startsAt: string }
const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
export const SCOREBOARD_RECENT_MS = 15 * 60_000
export function eventsToTrigger(events: TriggerEvent[], finals: FinalGame[], now: Date): string[] {
  const out: string[] = []
  for (const e of events) {
    if (e.finalFirstSeenAt && now.getTime() - e.finalFirstSeenAt.getTime() > SCOREBOARD_RECENT_MS) continue
    if (e.startsAt.getTime() > now.getTime()) continue
    const hit = finals.some(
      (g) =>
        g.sport === e.sport &&
        (g.id === e.externalId ||
          Object.values(e.aliases ?? {}).includes(g.id) ||
          (canon(g.home) === canon(e.homeName) && canon(g.away) === canon(e.awayName) && Math.abs(Date.parse(g.startsAt) - e.startsAt.getTime()) < 20 * 60_000)),
    )
    if (hit) out.push(e.id)
  }
  return out
}
