import type { LiveSelection, LiveSource } from "./types.ts"

/**
 * Worker planning, pure: which games are worth polling now, how often, and which polled quotes are worth a row.
 * Upstream calls scale with the number of live games (and live sports), never with viewers: the worker polls on
 * its own clock and users only ever read the database.
 */

export const POLL_MS = 10_000
export const IDLE_POLL_MS = 30_000

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

export type QuoteKey = `${string}|${string}|${LiveSelection}|${LiveSource}`
export const quoteKey = (eventId: string, market: string, selection: LiveSelection, source: LiveSource): QuoteKey => `${eventId}|${market}|${selection}|${source}`

export type LastWrite = { bid: number | null; ask: number | null; at: Date }

/**
 * Whether a polled quote earns a row. Unchanged books are skipped except for a heartbeat, which keeps the
 * latest row's fetched time inside the 30s "live" window while limiting a 3 hour game to about 700 rows per key.
 */
export function shouldWrite(prev: LastWrite | undefined, next: { bid: number | null; ask: number | null }, now: Date, heartbeatMs = 15_000): boolean {
  if (!prev) return true
  if (prev.bid !== next.bid || prev.ask !== next.ask) return true
  return now.getTime() - prev.at.getTime() >= heartbeatMs
}
