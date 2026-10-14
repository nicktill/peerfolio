import "server-only"
import { gte, lt, sql } from "drizzle-orm"
import { db, providerRequestStats } from "@web/db"
import { budgetFor, type ProviderName } from "@web/lib/provider-fetch"
import { buildDashboard, RANGES, type RangeKey, type StatRow } from "@web/lib/provider-stats-core"

const KEEP_DAYS = 30
const PROVIDERS: ProviderName[] = ["alpaca", "finnhub", "massive", "tiingo"]

export type Outcome = { requests?: number; symbols?: number; denied?: number; rateLimited?: number; failed?: number }

/** Adds to this minute's counters for `provider`. One upsert; never throws. */
export async function recordProviderRequest(provider: string, outcome: Outcome): Promise<void> {
  const n = (v?: number) => v ?? 0
  try {
    await db
      .insert(providerRequestStats)
      .values({
        provider,
        minute: sql`date_trunc('minute', now())`,
        requests: n(outcome.requests),
        symbols: n(outcome.symbols),
        denied: n(outcome.denied),
        rateLimited: n(outcome.rateLimited),
        failed: n(outcome.failed),
      })
      .onConflictDoUpdate({
        target: [providerRequestStats.provider, providerRequestStats.minute],
        set: {
          requests: sql`${providerRequestStats.requests} + ${n(outcome.requests)}`,
          symbols: sql`${providerRequestStats.symbols} + ${n(outcome.symbols)}`,
          denied: sql`${providerRequestStats.denied} + ${n(outcome.denied)}`,
          rateLimited: sql`${providerRequestStats.rateLimited} + ${n(outcome.rateLimited)}`,
          failed: sql`${providerRequestStats.failed} + ${n(outcome.failed)}`,
        },
      })
  } catch {
    // Metrics must never get in the way of fetching prices.
  }
}

/** The admin dashboard's data for `range`, with the hourly allowance we set ourselves. */
export async function providerDashboard(range: RangeKey, now = new Date()) {
  // Today's totals and the last hour are shown whatever the range, so read back at least to UTC midnight.
  const since = new Date(Math.min(now.getTime() - RANGES[range].ms, Date.parse(now.toISOString().slice(0, 10))) - 86_400_000)
  const rows: StatRow[] = await db.select().from(providerRequestStats).where(gte(providerRequestStats.minute, since))
  const hourlyBudgets = Object.fromEntries(PROVIDERS.map((p) => [p, Math.round(budgetFor(p).perMinute * 60)]))
  return buildDashboard(rows, { now, range, hourlyBudgets })
}

/** Drops counters older than 30 days. */
export async function pruneProviderStats(now = new Date()): Promise<void> {
  await db.delete(providerRequestStats).where(lt(providerRequestStats.minute, new Date(now.getTime() - KEEP_DAYS * 86_400_000)))
}
