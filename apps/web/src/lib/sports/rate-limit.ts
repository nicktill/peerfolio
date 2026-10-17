/**
 * Rate limits for sports actions. Counting is done in Postgres (`sports_rate_limits`,
 * fixed windows) so the limit holds across every server instance; this file is the
 * pure part: which actions are limited, and which window a moment falls in.
 */

export type LimitName = "join" | "pick" | "create"

export const LIMITS: Record<LimitName, { max: number; windowMs: number }> = {
  /** Enough for typos, too slow to guess 8-character invite codes. */
  join: { max: 8, windowMs: 60_000 },
  /** A fast human taps well under this; a script hammering lines does not. */
  pick: { max: 30, windowMs: 60_000 },
  /** League spam. */
  create: { max: 5, windowMs: 3_600_000 },
}

export const bucketOf = (now: Date, windowMs: number): number => Math.floor(now.getTime() / windowMs)

export const withinLimit = (count: number, max: number): boolean => count <= max

/** Windows older than this many windows ago are safe to delete. */
export const PRUNE_AFTER_WINDOWS = 3
