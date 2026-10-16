import { lt, sql } from "drizzle-orm"
import { db, rateLimits } from "@web/db"
import { ApiError } from "@web/lib/api"
import { MOBILE_LIMITS, checkRateLimit, clientAddress, type RateStore } from "@web/lib/rate-limit-core"

const store: RateStore = {
  async hit(key, windowStart) {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
      .returning({ count: rateLimits.count })
    return row!.count
  },
  async prune(before) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, before))
  },
}

/**
 * Throws a 429 when the caller (by address) has used up this endpoint's allowance for the window.
 * A database failure lets the request through: a broken limiter must not lock everyone out of signing in.
 */
export async function enforceMobileLimit(request: Request, name: keyof typeof MOBILE_LIMITS) {
  const policy = MOBILE_LIMITS[name]
  try {
    const result = await checkRateLimit(store, `${name}:${clientAddress(request.headers)}`, policy)
    // Housekeeping on roughly 1% of calls keeps the table tiny without a cron job.
    if (Math.random() < 0.01) void store.prune(new Date(Date.now() - 60 * 60 * 1000)).catch(() => {})
    if (!result.ok) throw new ApiError("Too many attempts. Wait a moment and try again.", 429, { retryAfterSec: result.retryAfterSec })
  } catch (error) {
    if (error instanceof ApiError) throw error
    console.error("[mobile] rate limiter unavailable", error instanceof Error ? error.message : error)
  }
}
