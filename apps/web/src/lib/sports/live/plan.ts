import type { LiveSelection, LiveSource } from "./types.ts"

/**
 * Worker planning, pure: which games are worth polling now, how often, and which polled quotes are worth a row.
 * Upstream calls scale with the number of live games (and live sports), never with viewers: the worker polls on
 * its own clock and users only ever read the database.
 */

export const POLL_MS = 10_000
/** Slate check cadence while a game is about to start (within WAKE_LEAD_MS + this). */
export const IDLE_POLL_MS = 30_000
/** The longest the worker sleeps with nothing live: bounds how late a game whose start moved EARLIER is noticed. */
export const MAX_SLEEP_MS = 15 * 60_000
/** Wake this long before the next scheduled start, then poll the slate at IDLE_POLL_MS until it fills (5 min pre-start window). */
export const WAKE_LEAD_MS = 10 * 60_000

export type SlateEvent = { id: string; sport: string; status: string; startsAt: Date; homeName: string; awayName: string }

/** Longest a game of each sport plausibly stays unfinished, after which it is not polled (settlement still handles it). */
const MAX_LIVE_MS: Record<string, number> = { nfl: 5 * 3600_000, nba: 4 * 3600_000, tennis: 6 * 3600_000 }
/** Start polling shortly before the scheduled start so the first live quote is already there at kickoff. */
export const PRE_START_MS = 5 * 60_000

/** The live slate: games that should be on the field now. A final, postponed or cancelled game is never in it. */
export function liveSlate<E extends SlateEvent>(events: E[], now: Date): E[] {
  return events.filter((e) => {
    if (e.status !== "scheduled") return false
    const since = now.getTime() - e.startsAt.getTime()
    return since >= -PRE_START_MS && since <= (MAX_LIVE_MS[e.sport] ?? 4 * 3600_000)
  })
}

export const pollDelay = (slateSize: number): number => (slateSize > 0 ? POLL_MS : IDLE_POLL_MS)

/**
 * How long to sleep when the slate is empty, so an idle worker leaves a serverless Postgres (Neon) free to suspend.
 * Sleeps until WAKE_LEAD_MS before the next scheduled start, capped at MAX_SLEEP_MS (no known game: the cap), never
 * below IDLE_POLL_MS. Within the lead window it polls at IDLE_POLL_MS.
 */
export function idleSleepMs(now: Date, nextStartsAt: Date | null): number {
  if (!nextStartsAt) return MAX_SLEEP_MS
  const until = nextStartsAt.getTime() - WAKE_LEAD_MS - now.getTime()
  return Math.min(MAX_SLEEP_MS, Math.max(IDLE_POLL_MS, until))
}

export type QuoteKey = `${string}|${string}|${LiveSelection}|${LiveSource}`
export const quoteKey = (eventId: string, market: string, selection: LiveSelection, source: LiveSource): QuoteKey => `${eventId}|${market}|${selection}|${source}`

export type LastWrite = { bid: number | null; ask: number | null; at: Date }

/**
 * Whether a polled quote earns a row. Default: every tick, so the newest row is never more than one tick old
 * (a 15s heartbeat on a 10s tick would leave gaps of up to 20s and eat the 30s "live" budget; see PIPELINE in
 * freshness.ts). A positive `heartbeatMs` skips unchanged books inside that window. Rows are thinned afterwards by
 * the retention policy, so a 3 hour game costs about 1100 rows per key while live and a few dozen after.
 */
export function shouldWrite(prev: LastWrite | undefined, next: { bid: number | null; ask: number | null }, now: Date, heartbeatMs = 0): boolean {
  if (!prev) return true
  if (prev.bid !== next.bid || prev.ask !== next.ask) return true
  return now.getTime() - prev.at.getTime() >= heartbeatMs
}

/** What the worker learned about a book's timestamp on previous polls, per key. */
export type BookClock = { sourceTs: number | null; bid: number | null; ask: number | null; changedAt: number }

/**
 * M4: does `book.timestamp` mean "snapshot time" or "time of last change"? Unknown until a real game, so we track our
 * own last-seen-change time, and offer a policy switch. "strict" (default) stores the source timestamp as given, so a
 * quiet book whose timestamp stops advancing looks old and eventually pauses. "fetch" treats a book that is unchanged
 * since the previous poll AND whose timestamp is merely old (not going backwards) as a quiet live book: it stores no
 * source timestamp, so freshness is our fetch time. Returns the sourceTs to store and the updated clock.
 */
export function bookClock(
  prev: BookClock | undefined,
  next: { sourceTs: Date | null; bid: number | null; ask: number | null },
  fetchedAt: Date,
  mode: "strict" | "fetch",
): { sourceTs: Date | null; clock: BookClock; changeAgeMs: number; sourceAgeMs: number | null; quiet: boolean } {
  const ts = next.sourceTs ? next.sourceTs.getTime() : null
  const changed = !prev || prev.bid !== next.bid || prev.ask !== next.ask || prev.sourceTs !== ts
  const changedAt = changed ? fetchedAt.getTime() : prev!.changedAt
  const sourceAgeMs = ts == null ? null : fetchedAt.getTime() - ts
  // Quiet: content and timestamp both identical to last poll, and the timestamp lags the fetch by more than the live window.
  const quiet = !changed && sourceAgeMs != null && sourceAgeMs > 30_000
  return {
    sourceTs: mode === "fetch" && quiet ? null : next.sourceTs,
    clock: { sourceTs: ts, bid: next.bid, ask: next.ask, changedAt },
    changeAgeMs: fetchedAt.getTime() - changedAt,
    sourceAgeMs,
    quiet,
  }
}
