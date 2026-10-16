import { createHash } from "node:crypto"

/**
 * Fixed-window request counting for the unauthenticated mobile endpoints.
 *
 * The store is injected so the policy is testable without a database; production uses a Postgres upsert because
 * serverless instances do not share memory, so an in-process counter would let a caller spread attempts across them.
 */
export interface RateStore {
  /** Adds one to the counter for (key, windowStart) and returns the new count. */
  hit(key: string, windowStart: Date): Promise<number>
  /** Drops counters for windows that ended before `before`. */
  prune(before: Date): Promise<void>
}

export type RateResult = { ok: boolean; remaining: number; retryAfterSec: number }

export async function checkRateLimit(
  store: RateStore,
  key: string,
  policy: { limit: number; windowSec: number },
  now = new Date(),
): Promise<RateResult> {
  const windowMs = policy.windowSec * 1000
  const start = Math.floor(now.getTime() / windowMs) * windowMs
  const count = await store.hit(hashKey(key), new Date(start))
  const retryAfterSec = Math.max(1, Math.ceil((start + windowMs - now.getTime()) / 1000))
  return { ok: count <= policy.limit, remaining: Math.max(0, policy.limit - count), retryAfterSec }
}

/** Keys are stored hashed so the table never holds raw IP addresses. */
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 32)

/** The caller's address as the platform reports it (first hop of `x-forwarded-for`), or a shared bucket when absent. */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown"
}

/** Limits per endpoint: generous for real use, tight enough to make guessing codes or tokens pointless. */
export const MOBILE_LIMITS = {
  token: { limit: 20, windowSec: 60 },
  refresh: { limit: 60, windowSec: 60 },
  logout: { limit: 60, windowSec: 60 },
  review: { limit: 5, windowSec: 300 },
  device: { limit: 30, windowSec: 60 },
} as const
