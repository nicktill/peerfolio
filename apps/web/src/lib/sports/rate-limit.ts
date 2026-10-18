/**
 * Rate limits for sports actions. Counting is done in Postgres (`sports_rate_limits`,
 * fixed windows) so the limit holds across every server instance; this file is the
 * pure part: which actions are limited, and which window a moment falls in.
 */

export type LimitName = "join" | "pick" | "create" | "sync" | "quote" | "search" | "trade" | "leagueJoin" | "fantasyJoin" | "importAi"

export const LIMITS: Record<LimitName, { max: number; windowMs: number }> = {
  /** Enough for typos, too slow to guess 8-character invite codes. */
  join: { max: 8, windowMs: 60_000 },
  /** A fast human taps well under this; a script hammering lines does not. */
  pick: { max: 30, windowMs: 60_000 },
  /** League spam. */
  create: { max: 5, windowMs: 3_600_000 },
  /* Not sports: the same table also throttles other expensive or guessable endpoints. Generous enough that normal use never hits them. */
  /** Plaid sync/re-sync. Only enforced when PLAID_SYNC_LIMIT_PER_MIN is set (see syncLimitFromEnv); the env value replaces `max`. */
  sync: { max: 6, windowMs: 60_000 },
  quote: { max: 120, windowMs: 60_000 },
  search: { max: 120, windowMs: 60_000 },
  trade: { max: 30, windowMs: 60_000 },
  leagueJoin: { max: 20, windowMs: 60_000 },
  fantasyJoin: { max: 20, windowMs: 60_000 },
  /** AI import reads cost money. */
  importAi: { max: 12, windowMs: 3_600_000 },
}

/** Per-user per-minute cap for Plaid syncs from the environment. Unset, 0 or garbage means no limiting (null). */
export const syncLimitFromEnv = (env: Record<string, string | undefined>): number | null => {
  const n = Number(env.PLAID_SYNC_LIMIT_PER_MIN)
  return Number.isInteger(n) && n > 0 ? n : null
}

export const bucketOf = (now: Date, windowMs: number): number => Math.floor(now.getTime() / windowMs)

export const withinLimit = (count: number, max: number): boolean => count <= max

/** Windows older than this many windows ago are safe to delete. */
export const PRUNE_AFTER_WINDOWS = 3
