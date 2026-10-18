import { and, eq, inArray, like, lt, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "../../db/schema.ts"
import { buildResultsProviders, resolveConfigFor } from "./providers/index.ts"
import { claimName, eventsToTrigger, nextClaim, TRIGGER, type FinalGame, type TriggerKind } from "./settle-trigger.ts"
import { DbUsageStore, settleDueEvents } from "./store.ts"

type Db = PostgresJsDatabase<typeof schema>
const { liveWorker, sportsEvents, sportsMarkets } = schema

export type SettleNowOutcome =
  | { ran: false; reason: "too_soon" | "budget_spent" | "no_open_markets" }
  | { ran: true; settled: number; voided: number; waiting: number; review: number; failedSources: number }

/**
 * Takes one targeted-poll slot for an event: at most one per TRIGGER.minGapMs and TRIGGER.maxPolls per series, across every caller and
 * every server instance. The row (in `live_worker`, keyed by `settle-<kind>:<eventId>`, no schema change) is locked while it is read and
 * written, so two callers cannot both pass.
 */
export async function claimSettlePoll(db: Db, kind: TriggerKind, eventId: string, now: Date) {
  const name = claimName(kind, eventId)
  return db.transaction(async (tx) => {
    await tx.insert(liveWorker).values({ name, lastCycleAt: new Date(0), details: { polls: 0 } }).onConflictDoNothing()
    const [row] = await tx.select().from(liveWorker).where(eq(liveWorker.name, name)).for("update")
    const d = nextClaim({ at: row!.lastCycleAt, polls: Number((row!.details as { polls?: number }).polls ?? 0) }, now, { minGapMs: TRIGGER.minGapMs, maxPolls: TRIGGER.maxPolls[kind] })
    if (d.ok) await tx.update(liveWorker).set({ lastCycleAt: now, details: { polls: d.polls } }).where(eq(liveWorker.name, name))
    return d
  })
}

/** Drops the claim rows of a finished event and any older than a day. */
async function cleanupClaims(db: Db, eventId: string, now: Date) {
  await db.delete(liveWorker).where(inArray(liveWorker.name, [claimName("final", eventId), claimName("probe", eventId)]))
  await db.delete(liveWorker).where(and(like(liveWorker.name, "settle-%:%"), lt(liveWorker.lastCycleAt, new Date(now.getTime() - 24 * 3600_000))))
}

/**
 * Immediate settle pass for ONE event, asked for by a fast signal (live worker, scoreboard). It is the cron's per-event logic
 * (`settleDueEvents` with an eventId filter), so it cannot pay out on its own say-so: quorum, official final, plausibility,
 * review and the stability window all apply. Safe to call concurrently with the cron (market row locks, unique ledger keys).
 */
export async function settleEventNow(db: Db, eventId: string, kind: TriggerKind, now = new Date()): Promise<SettleNowOutcome> {
  const claim = await claimSettlePoll(db, kind, eventId, now)
  if (!claim.ok) return { ran: false, reason: claim.reason }
  const providers = buildResultsProviders()
  const out = await settleDueEvents(db, providers, now, resolveConfigFor(providers), new DbUsageStore(db), { eventId })
  if (out.settled + out.voided + out.waiting + out.review === 0) return { ran: false, reason: "no_open_markets" }
  if (out.settled + out.voided + out.review > 0) await cleanupClaims(db, eventId, now).catch(() => undefined)
  return { ran: true, settled: out.settled, voided: out.voided, waiting: out.waiting, review: out.review, failedSources: out.failedSources }
}

/**
 * Viewer-driven: the public scoreboard just showed these games as final. Triggers a targeted settle for each event of ours that has
 * open markets on one. Bounded by the shared claim (one poll per event per 15s whoever asks, 30 per series) so open clients never
 * multiply provider calls. Errors are swallowed: this is a best-effort background nudge.
 */
export async function triggerFromScoreboard(db: Db, finals: FinalGame[], now = new Date()): Promise<number> {
  if (!finals.length) return 0
  const sports = [...new Set(finals.map((g) => g.sport))]
  const rows = await db
    .selectDistinct({ e: sportsEvents })
    .from(sportsEvents)
    .innerJoin(sportsMarkets, eq(sportsMarkets.eventId, sportsEvents.id))
    .where(
      and(
        inArray(sportsMarkets.status, ["open", "locked"]),
        inArray(sportsEvents.sport, sports),
        sql`${sportsEvents.startsAt} < ${now.toISOString()}::timestamptz`,
        sql`${sportsEvents.startsAt} > ${new Date(now.getTime() - 24 * 3600_000).toISOString()}::timestamptz`,
      ),
    )
  const ids = eventsToTrigger(rows.map((r) => r.e), finals, now)
  let ran = 0
  for (const id of ids) {
    try {
      if ((await settleEventNow(db, id, "final", now)).ran) ran++
    } catch (error) {
      console.error("[sports] scoreboard-triggered settle failed:", error instanceof Error ? error.message : error)
    }
  }
  return ran
}
