import { db } from "@web/db"
import { ApiError } from "@web/lib/api"
import { syncLimitFromEnv, type LimitName } from "@web/lib/sports/rate-limit"
import { takeRateLimit } from "@web/lib/sports/store"

const TOO_FAST = "Slow down a little, then try again."

/** Counts one use against a named per-user limit (shared Postgres windows) and throws a friendly 429 when it is over. */
export async function enforceRateLimit(name: LimitName, userId: string) {
  if (!(await takeRateLimit(db, name, userId))) throw new ApiError(TOO_FAST, 429)
}

/** Plaid sync throttle: off unless PLAID_SYNC_LIMIT_PER_MIN is a positive number. */
export async function enforceSyncLimit(userId: string, env: Record<string, string | undefined> = process.env) {
  const max = syncLimitFromEnv(env)
  if (max === null) return
  if (!(await takeRateLimit(db, "sync", userId, new Date(), max))) throw new ApiError(TOO_FAST, 429)
}
