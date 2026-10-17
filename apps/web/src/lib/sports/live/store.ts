import { and, eq, gt, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "../../../db/schema.ts"
import { liveSlate, type SlateEvent } from "./plan.ts"
import { DEFAULT_RETENTION, retentionCutoffs, type RetentionPolicy } from "./retention.ts"
import type { LiveGameState, NormalizedQuote } from "./types.ts"
import { buildLiveView, READ_WINDOW_MS, type LiveView, type QuoteRow } from "./view.ts"

/**
 * Database layer for the live odds tables. Takes the drizzle client as a parameter so Next routes and the
 * standalone worker share it. Touches only live_quote, live_state and READS sports_events; it never reads or
 * writes picks, lines, markets or the ledger.
 */

type Db = PostgresJsDatabase<typeof schema>
const { liveQuote, liveState, sportsEvents } = schema

export type QuoteInsert = {
  eventId: string
  market: string
  selection: "home" | "away"
  source: string
  bid: number | null
  ask: number | null
  mid: number | null
  sourceTs: Date | null
  fetchedTs: Date
}

export const quoteInsertFrom = (eventId: string, q: NormalizedQuote, fetchedTs: Date, sourceTs: Date | null): QuoteInsert => ({
  eventId,
  market: "moneyline",
  selection: q.selection,
  source: q.source,
  bid: q.bid,
  ask: q.ask,
  mid: q.mid,
  sourceTs,
  fetchedTs,
})

export async function insertQuotes(db: Db, rows: QuoteInsert[]): Promise<void> {
  if (rows.length) await db.insert(liveQuote).values(rows)
}

export async function upsertState(db: Db, eventId: string, s: LiveGameState): Promise<void> {
  const values = {
    status: s.status,
    homeScore: s.homeScore,
    awayScore: s.awayScore,
    period: s.period,
    clock: s.clock,
    source: s.source,
    sourceTs: s.sourceTs,
    fetchedTs: s.fetchedTs,
  }
  await db.insert(liveState).values({ eventId, ...values }).onConflictDoUpdate({ target: liveState.eventId, set: values })
}

/** Games that should be polled now: scheduled (not final/void) and inside their live window. One cheap query. */
export async function loadLiveSlate(db: Db, now: Date): Promise<(SlateEvent & { externalId: string })[]> {
  const rows = await db
    .select({
      id: sportsEvents.id,
      externalId: sportsEvents.externalId,
      sport: sportsEvents.sport,
      status: sportsEvents.status,
      startsAt: sportsEvents.startsAt,
      homeName: sportsEvents.homeName,
      awayName: sportsEvents.awayName,
    })
    .from(sportsEvents)
    .where(and(eq(sportsEvents.status, "scheduled"), gt(sportsEvents.startsAt, new Date(now.getTime() - 8 * 3600_000)), sql`${sportsEvents.startsAt} <= ${new Date(now.getTime() + 10 * 60_000).toISOString()}::timestamptz`))
  return liveSlate(rows, now)
}

/** The served view of one game, newest row per key. Returns null for an unknown game. */
export async function readLiveView(db: Db, eventId: string, now: Date): Promise<LiveView | null> {
  const [event] = await db.select({ id: sportsEvents.id, status: sportsEvents.status }).from(sportsEvents).where(eq(sportsEvents.id, eventId)).limit(1)
  if (!event) return null
  const since = new Date(now.getTime() - READ_WINDOW_MS)
  const quotes = await db.execute<QuoteRow>(sql`
    SELECT DISTINCT ON (market, selection, source)
      market, selection, source, bid, ask, mid, source_ts AS "sourceTs", fetched_ts AS "fetchedTs"
    FROM live_quote
    WHERE event_id = ${eventId} AND fetched_ts > ${since.toISOString()}::timestamptz
    ORDER BY market, selection, source, fetched_ts DESC`)
  const [state] = await db.select().from(liveState).where(eq(liveState.eventId, eventId)).limit(1)
  const toDate = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)))
  return buildLiveView(
    {
      eventId,
      eventStatus: event.status,
      quotes: [...quotes].map((q) => ({ ...q, sourceTs: toDate(q.sourceTs), fetchedTs: toDate(q.fetchedTs)! })),
      state: state ?? null,
    },
    now,
  )
}

/**
 * Applies the retention policy (see retention.ts): all rows for the last 30 min, one per key per 5 min until 3
 * days, then only the latest per key, and nothing at all for games older than 30 days. Idempotent; run every few
 * minutes by the worker. Returns the number of rows deleted.
 */
export async function pruneLiveQuotes(db: Db, now: Date, policy: RetentionPolicy = DEFAULT_RETENTION): Promise<number> {
  const c = retentionCutoffs(now, policy)
  const rows = await db.execute<{ id: number }>(sql`
    DELETE FROM live_quote WHERE id IN (
      SELECT id FROM (
        SELECT id, fetched_ts,
          row_number() OVER (
            PARTITION BY event_id, market, selection, source, floor(extract(epoch FROM fetched_ts) / ${c.bucketSeconds})
            ORDER BY fetched_ts DESC, id DESC) AS in_bucket,
          row_number() OVER (
            PARTITION BY event_id, market, selection, source
            ORDER BY fetched_ts DESC, id DESC) AS in_key
        FROM live_quote
      ) t
      WHERE fetched_ts < ${c.purgeBefore.toISOString()}::timestamptz
         OR (fetched_ts < ${c.rawBefore.toISOString()}::timestamptz
             AND in_key > 1
             AND (in_bucket > 1 OR fetched_ts < ${c.coarseBefore.toISOString()}::timestamptz))
    ) RETURNING id`)
  return rows.length
}
