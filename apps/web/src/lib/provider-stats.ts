import "server-only"
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db, providerRequestEvents, providerRequestStats } from "@web/db"
import { budgetFor, type ProviderName } from "@web/lib/provider-fetch"
import {
  buildDashboard,
  EVENT_KEEP_DAYS,
  EVENT_KINDS,
  groupReasons,
  RANGES,
  type EventKind,
  type EventsResponse,
  type NewProviderEvent,
  type ProviderEventRow,
  type RangeKey,
  type StatRow,
} from "@web/lib/provider-stats-core"

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

/** Stores one non-success request. One insert; never throws. */
export async function recordProviderEvent(event: NewProviderEvent): Promise<void> {
  try {
    await db.insert(providerRequestEvents).values({
      provider: event.provider,
      kind: event.kind,
      httpStatus: event.httpStatus,
      endpoint: event.endpoint,
      symbolsCount: event.symbolsCount,
      symbolsSample: event.symbolsSample,
      reason: event.reason,
      waitSeconds: event.waitSeconds,
      caller: event.caller,
      suppressed: event.suppressed,
    })
  } catch {
    // The log must never get in the way of fetching prices.
  }
}

const EVENT_LIMIT_MAX = 200
const REASON_SAMPLE = 2000

/** The admin event log: newest first, optionally one provider and/or kind, within `range`. */
export async function providerEvents(
  { range, provider, kinds, limit = 100, now = new Date() }: { range: RangeKey; provider?: string; kinds?: EventKind[]; limit?: number; now?: Date },
): Promise<EventsResponse> {
  const ms = Math.min(RANGES[range].ms, EVENT_KEEP_DAYS * 86_400_000)
  const since = new Date(now.getTime() - ms)
  const window = gte(providerRequestEvents.at, since)
  const filters = and(window, provider ? eq(providerRequestEvents.provider, provider) : undefined, kinds?.length ? inArray(providerRequestEvents.kind, kinds) : undefined)
  const take = Math.min(Math.max(1, limit), EVENT_LIMIT_MAX)

  const toRow = (r: typeof providerRequestEvents.$inferSelect): ProviderEventRow => ({
    id: r.id,
    at: r.at.toISOString(),
    provider: r.provider,
    kind: r.kind as EventKind,
    httpStatus: r.httpStatus,
    endpoint: r.endpoint,
    symbolsCount: r.symbolsCount,
    symbolsSample: r.symbolsSample ? r.symbolsSample.split(",") : [],
    reason: r.reason,
    waitSeconds: r.waitSeconds,
    caller: r.caller,
    suppressed: r.suppressed,
  })

  const [rows, counts, forReasons] = await Promise.all([
    db.select().from(providerRequestEvents).where(filters).orderBy(desc(providerRequestEvents.at), desc(providerRequestEvents.id)).limit(take + 1),
    db.select({ kind: providerRequestEvents.kind, n: sql<number>`count(*)::int` }).from(providerRequestEvents).where(window).groupBy(providerRequestEvents.kind),
    db.select().from(providerRequestEvents).where(filters).orderBy(desc(providerRequestEvents.at)).limit(REASON_SAMPLE),
  ])
  const totals = Object.fromEntries(EVENT_KINDS.map((k) => [k, counts.find((c) => c.kind === k)?.n ?? 0])) as Record<EventKind, number>
  return {
    from: since.toISOString(),
    to: now.toISOString(),
    events: rows.slice(0, take).map(toRow),
    totals,
    reasons: groupReasons(forReasons.map(toRow)),
    more: rows.length > take,
  }
}

/** Drops events older than 14 days. */
export async function pruneProviderEvents(now = new Date()): Promise<void> {
  await db.delete(providerRequestEvents).where(lt(providerRequestEvents.at, new Date(now.getTime() - EVENT_KEEP_DAYS * 86_400_000)))
}
