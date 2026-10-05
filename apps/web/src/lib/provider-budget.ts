import { sql } from "drizzle-orm"
import { db } from "@web/db"
import type { Budget, ProviderName, Take } from "@web/lib/provider-fetch"

/**
 * The shared token buckets behind `providerFetch`, one row per provider in
 * `provider_budgets`. Each request is one statement: the row lock makes servers
 * asking at the same moment take turns, and each sees the tokens the one before it
 * left. Tokens refill continuously at `perMinute` up to `burst`, so any 60 seconds
 * hold at most `burst + perMinute` requests. Database time is the only clock.
 */

const float = (n: number) => sql`${n}::float8`

async function take(provider: ProviderName, { perMinute, burst }: Budget): Promise<Take> {
  const perSecond = perMinute / 60
  const refilled = sql`LEAST(${float(burst)}, b.tokens + ${float(perSecond)} * GREATEST(0, EXTRACT(EPOCH FROM clock_timestamp() - b.refilled_at)::float8))`
  const open = sql`(b.blocked_until IS NULL OR b.blocked_until <= clock_timestamp())`
  const grant = sql`(${open} AND ${refilled} >= 1)`
  try {
    const [row] = [
      ...(await db.execute<{ granted: boolean; tokens: number; blocked_for: number | null }>(sql`
        INSERT INTO provider_budgets AS b (provider, tokens, refilled_at, last_granted)
        VALUES (${provider}, ${float(burst - 1)}, clock_timestamp(), true)
        ON CONFLICT (provider) DO UPDATE SET
          tokens = ${refilled} - CASE WHEN ${grant} THEN 1 ELSE 0 END,
          refilled_at = GREATEST(b.refilled_at, clock_timestamp()),
          last_granted = ${grant}
        RETURNING last_granted AS granted, tokens, EXTRACT(EPOCH FROM b.blocked_until - clock_timestamp())::float8 AS blocked_for`)),
    ]
    if (!row || row.granted) return { granted: true, waitSeconds: 0 }
    const blockedFor = Math.max(0, Number(row.blocked_for ?? 0))
    // After a cooldown the bucket starts empty, so the first token is one interval later.
    const toNextToken = Math.max(0, 1 - Number(row.tokens)) / perSecond
    return { granted: false, waitSeconds: blockedFor + toNextToken }
  } catch (error) {
    // The database being unreachable shouldn't take prices down with it.
    console.error(`[budget] ${provider} budget check failed, letting the request through:`, error instanceof Error ? error.message : error)
    return { granted: true, waitSeconds: 0 }
  }
}

/** After a 429: every server leaves `provider` alone for `seconds`, then refills from empty. */
async function cooldown(provider: ProviderName, seconds: number): Promise<void> {
  const until = sql`clock_timestamp() + make_interval(secs => ${float(seconds)})`
  try {
    await db.execute(sql`
      INSERT INTO provider_budgets AS b (provider, tokens, refilled_at, blocked_until, last_granted)
      VALUES (${provider}, 0, ${until}, ${until}, false)
      ON CONFLICT (provider) DO UPDATE SET
        tokens = 0,
        blocked_until = GREATEST(COALESCE(b.blocked_until, EXCLUDED.blocked_until), EXCLUDED.blocked_until),
        refilled_at = GREATEST(COALESCE(b.blocked_until, EXCLUDED.blocked_until), EXCLUDED.blocked_until)`)
  } catch (error) {
    console.error(`[budget] couldn't record ${provider} cooldown:`, error instanceof Error ? error.message : error)
  }
}

export const gate = { take, cooldown }
