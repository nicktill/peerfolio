import { and, eq, gt, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "../../../db/schema.ts"
import type { HealthGame, HealthInput } from "./health.ts"
import { liveWantedEventSql, trackedEventSql } from "../ingestion-scope.ts"
import { ACTIVITY_NAME, ACTIVITY_TOUCH_MS } from "./activity.ts"
import { liveSlate, type SlateEvent } from "./plan.ts"
import { DEFAULT_RETENTION, retentionCutoffs, type RetentionPolicy } from "./retention.ts"
import type { LiveGameState, NormalizedQuote } from "./types.ts"
import { buildLiveView, READ_WINDOW_MS, type LiveView, type QuoteRow, type StateRow } from "./view.ts"

/**
 * Database layer for the live odds tables. Takes the drizzle client as a parameter so Next routes and the
 * standalone worker share it. Reads event and league/pick eligibility; writes live quotes, state and health.
 * Never writes picks, lines, markets or the ledger.
 */

type Db = PostgresJsDatabase<typeof schema>
const { liveQuote, liveState, liveWorker, sportsEvents } = schema

export type QuoteInsert = {
  eventId: string
  market: string
  selection: "home" | "away" | "draw"
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

/**
 * Games that should be polled now: scheduled (not final/void), inside their live window, and either being watched or carrying an open pick
 * (see liveWantedEventSql). With nobody watching and nothing riding on a game the slate is empty, so the worker sleeps to the next shared slot.
 */
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
    .where(and(liveWantedEventSql(now), eq(sportsEvents.status, "scheduled"), gt(sportsEvents.startsAt, new Date(now.getTime() - 8 * 3600_000)), sql`${sportsEvents.startsAt} <= ${new Date(now.getTime() + 10 * 60_000).toISOString()}::timestamptz`))
  return liveSlate(rows, now)
}

/** What buildLiveView needs for one game, plus the event fields an on-demand read needs (live/on-demand.ts). Null for an unknown game. */
export type LiveInput = {
  eventId: string
  eventStatus: string
  sport: string
  quotes: QuoteRow[]
  state: StateRow | null
  event: SlateEvent & { externalId: string }
}

/** Stored rows for one game, newest row per key. Returns null for an unknown game. */
export async function readLiveInput(db: Db, eventId: string, now: Date): Promise<LiveInput | null> {
  const [event] = await db
    .select({ id: sportsEvents.id, externalId: sportsEvents.externalId, status: sportsEvents.status, sport: sportsEvents.sport, startsAt: sportsEvents.startsAt, homeName: sportsEvents.homeName, awayName: sportsEvents.awayName })
    .from(sportsEvents)
    .where(eq(sportsEvents.id, eventId))
    .limit(1)
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
  return {
    eventId,
    eventStatus: event.status,
    sport: event.sport,
    quotes: [...quotes].map((q) => ({ ...q, sourceTs: toDate(q.sourceTs), fetchedTs: toDate(q.fetchedTs)! })),
    state: state ?? null,
    event,
  }
}

/** The served view of one game, newest row per key. Returns null for an unknown game. */
export async function readLiveView(db: Db, eventId: string, now: Date): Promise<LiveView | null> {
  const input = await readLiveInput(db, eventId, now)
  return input ? buildLiveView(input, now) : null
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

/** Earliest scheduled start still ahead, so an idle worker can sleep until just before it. One indexed query. */
export async function nextStartAfter(db: Db, now: Date): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | string | null>`min(${sportsEvents.startsAt})` })
    .from(sportsEvents)
    .where(and(liveWantedEventSql(now), eq(sportsEvents.status, "scheduled"), gt(sportsEvents.startsAt, now)))
  return row?.at ? new Date(row.at) : null
}

/**
 * Earliest start of any tracked scheduled game, watched or not. The quiet-hours hourly sleep keys on this, not on nextStartAfter:
 * the publish guard trusts an announced hourly sleep (see reprice.ts workerBeating), so no tracked game may start within the
 * repricing window plus an hour of it, even one nobody is watching.
 */
export async function nextTrackedStartAfter(db: Db, now: Date): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | string | null>`min(${sportsEvents.startsAt})` })
    .from(sportsEvents)
    .where(and(trackedEventSql(now), eq(sportsEvents.status, "scheduled"), gt(sportsEvents.startsAt, now)))
  return row?.at ? new Date(row.at) : null
}

export type HeartbeatInput = { name: string; at: Date; ok: boolean; consecutiveFailures: number; details: Record<string, unknown> }

/** One row per worker, overwritten each cycle: lets /api/sports/live/health answer without reading logs. */
export async function writeHeartbeat(db: Db, h: HeartbeatInput): Promise<void> {
  const values = { lastCycleAt: h.at, consecutiveFailures: h.consecutiveFailures, details: h.details }
  await db
    .insert(liveWorker)
    .values({ name: h.name, ...values, lastOkAt: h.ok ? h.at : null })
    .onConflictDoUpdate({ target: liveWorker.name, set: h.ok ? { ...values, lastOkAt: h.at } : values })
}

let lastTouchAt = 0

/**
 * Marks the sports pages as in use. Throttled per server instance, never throws: a failed stamp must not fail the viewer's request.
 * True when this call wrote the stamp, so the caller can raise the worker's wake signal after it (live/watch.ts).
 */
export async function touchSportsActivity(db: Db, now: Date = new Date()): Promise<boolean> {
  if (now.getTime() - lastTouchAt < ACTIVITY_TOUCH_MS) return false
  lastTouchAt = now.getTime()
  return writeHeartbeat(db, { name: ACTIVITY_NAME, at: now, ok: true, consecutiveFailures: 0, details: {} }).then(
    () => true,
    () => {
      lastTouchAt = 0
      return false
    },
  )
}

/** When the sports pages were last in use, or null if never. */
export async function readSportsActivity(db: Db): Promise<Date | null> {
  const [row] = await db.select({ at: liveWorker.lastCycleAt }).from(liveWorker).where(eq(liveWorker.name, ACTIVITY_NAME)).limit(1)
  return row?.at ?? null
}

/** Everything liveHealth needs: the worker row and, for each game that should be live now, its newest quote and state. */
export async function readHealthInput(db: Db, name: string, now: Date): Promise<HealthInput> {
  const [w] = await db.select().from(liveWorker).where(eq(liveWorker.name, name)).limit(1)
  const slate = await loadLiveSlate(db, now)
  const toDate = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)))
  let liveGames: HealthGame[] = []
  if (slate.length) {
    const ids = slate.map((e) => e.id)
    const quotes = await db.execute<{ id: string; at: unknown }>(sql`SELECT event_id AS id, max(fetched_ts) AS at FROM live_quote WHERE event_id IN ${ids} GROUP BY event_id`)
    const states = await db.select({ id: liveState.eventId, at: liveState.fetchedTs }).from(liveState).where(inArray(liveState.eventId, ids))
    const q = new Map([...quotes].map((r) => [r.id, toDate(r.at)]))
    const s = new Map(states.map((r) => [r.id, r.at]))
    liveGames = slate.map((e) => ({ eventId: e.id, label: `${e.awayName} @ ${e.homeName}`, sport: e.sport, newestQuoteAt: q.get(e.id) ?? null, newestStateAt: s.get(e.id) ?? null }))
  }
  return { worker: w ? { lastCycleAt: w.lastCycleAt, lastOkAt: w.lastOkAt, consecutiveFailures: w.consecutiveFailures, details: w.details } : null, liveGames }
}
