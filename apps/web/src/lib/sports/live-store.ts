import { and, eq, inArray, like, sql } from "drizzle-orm"
import * as schema from "../../db/schema.ts"
import { emit } from "./log.ts"
import { acceptPick, DEFAULT_LIMITS, PickRejected, type PickContext } from "./picks.ts"
import { chooseLiveSlot, LivePickRejected, LIVE_KEY_PREFIX, LIVE_PICK, liveMarketKey } from "./live-pick.ts"
import { openRisk, SportsError, withDeadlockRetry, type Db } from "./store.ts"
import { placeKey } from "./settlement.ts"
import type { LiveSelection } from "./live/types.ts"

const { sportsLeagues, sportsMembers, sportsEvents, sportsMarkets, sportsLines, sportsPicks, sportsLedger } = schema

/** League, event and membership checks shared by the offer and the acceptance. Throws SportsError (404 for anything not visible to this member). */
export async function liveContext(db: Db, userId: string, leagueId: string, eventId: string) {
  const [league] = await db.select().from(sportsLeagues).where(eq(sportsLeagues.id, leagueId)).limit(1)
  const [member] = league ? await db.select({ id: sportsMembers.id }).from(sportsMembers).where(and(eq(sportsMembers.leagueId, leagueId), eq(sportsMembers.userId, userId))).limit(1) : []
  if (!league || !member) throw new SportsError("League not found", 404)
  if (!league.liveBetting) throw new SportsError("Live picks are off in this league")
  if (league.endsAt && league.endsAt.getTime() < Date.now()) throw new SportsError("That league has ended")
  const [event] = await db.select().from(sportsEvents).where(eq(sportsEvents.id, eventId)).limit(1)
  if (!event || !league.sports.includes(event.sport)) throw new SportsError("Game not found", 404)
  if (event.status !== "scheduled" || event.startsAt.getTime() > Date.now()) throw new SportsError("Live picks open once the game is in progress")
  return { league, event, memberId: member.id }
}

export type LiveSnapshot = { eventId: string; source: string; homeProb: number; awayProb: number; drawProb: number | null; homeScore: number; awayScore: number; period: string; quoteAsOf: string; stateAsOf: string }

/**
 * Places a live pick atomically, with the same lock order as pregame picks (market rows shared, then the member row
 * exclusive), the same ledger row and balance update, and the same idempotent requestId. Limits come from acceptPick (live
 * mode) plus chooseLiveSlot (per game cap, no same side twice, cooldown).
 */
export function placeLivePick(db: Db, userId: string, leagueId: string, req: { eventId: string; selection: LiveSelection; stake: number; price: number; requestId: string }, now?: Date) {
  return withDeadlockRetry(async () => {
    const result = await db.transaction(async (tx) => {
      const [league] = await tx.select().from(sportsLeagues).where(eq(sportsLeagues.id, leagueId)).limit(1)
      if (!league) throw new SportsError("League not found", 404)
      const [event] = await tx.select().from(sportsEvents).where(eq(sportsEvents.id, req.eventId)).limit(1)
      if (!event || !league.sports.includes(event.sport)) throw new SportsError("Game not found", 404)

      // Slot markets are created locked (never open: nothing reprices, freezes or lists them) and shared by every member.
      const keys = [1, 2].map(liveMarketKey)
      for (const marketKey of keys) {
        await tx.insert(sportsMarkets).values({ eventId: event.id, marketKey, kind: "moneyline", status: "locked", lockAt: event.startsAt, booksUsed: 0 }).onConflictDoNothing()
      }
      const markets = (await tx.select().from(sportsMarkets).where(and(eq(sportsMarkets.eventId, event.id), inArray(sportsMarkets.marketKey, keys))).orderBy(sportsMarkets.marketKey)).sort((a, b) => a.id.localeCompare(b.id))
      for (const m of markets) await tx.select({ id: sportsMarkets.id }).from(sportsMarkets).where(eq(sportsMarkets.id, m.id)).for("share")
      const [member] = await tx.execute<{ id: string; credits: number }>(sql`SELECT id, credits FROM sports_members WHERE league_id = ${leagueId} AND user_id = ${userId} FOR UPDATE`)
      if (!member) throw new SportsError("League not found", 404)
      const clock = now ?? new Date(String((await tx.execute<{ t: string }>(sql`SELECT clock_timestamp() AS t`))[0]!.t))

      const [replay] = await tx.select().from(sportsPicks).where(and(eq(sportsPicks.memberId, member.id), eq(sportsPicks.requestId, req.requestId))).limit(1)
      if (replay) return { pick: replay, replayed: true }
      if (!league.liveBetting) throw new SportsError("Live picks are off in this league")
      if (league.endsAt && league.endsAt.getTime() < clock.getTime()) throw new SportsError("That league has ended")
      // Shared row lock on the event: a settlement that is finalising it either finishes first (status seen below) or waits for this pick, which it then settles on its next pass.
      const [fresh] = await tx.select({ status: sportsEvents.status }).from(sportsEvents).where(eq(sportsEvents.id, event.id)).for("share")
      if (!fresh) throw new SportsError("Game not found", 404)

      const heldRows = await tx.select({ selection: sportsPicks.selection, marketKey: sportsMarkets.marketKey }).from(sportsPicks)
        .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
        .where(and(eq(sportsPicks.memberId, member.id), inArray(sportsMarkets.id, markets.map((m) => m.id))))
      const [last] = await tx.select({ at: sql<string | null>`max(${sportsPicks.acceptedAt})` }).from(sportsPicks)
        .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
        .where(and(eq(sportsPicks.memberId, member.id), like(sportsMarkets.marketKey, `${LIVE_KEY_PREFIX}%`)))
      let slot: number
      try {
        slot = chooseLiveSlot({ sport: event.sport, selection: req.selection, held: heldRows.map((h) => ({ selection: h.selection, slot: Number(h.marketKey.slice(LIVE_KEY_PREFIX.length)) })), lastLiveAt: last?.at ? new Date(last.at) : null, now: clock })
      } catch (error) {
        if (error instanceof LivePickRejected) throw new SportsError(error.message, 409)
        throw error
      }
      const market = markets.find((m) => m.marketKey === liveMarketKey(slot))!
      await tx.insert(sportsLines).values({ marketId: market.id, selection: req.selection, price: req.price, point: null }).onConflictDoNothing()
      const [line] = await tx.select().from(sportsLines).where(and(eq(sportsLines.marketId, market.id), eq(sportsLines.selection, req.selection))).limit(1)
      if (!line) throw new SportsError("Line not found", 404)

      const [existing] = await tx.select({ n: sql<number>`count(*)::int` }).from(sportsPicks).where(and(eq(sportsPicks.memberId, member.id), eq(sportsPicks.marketId, market.id)))
      const risk = await openRisk(tx, member.id)
      const ctx: PickContext = {
        now: clock,
        market: { id: market.id, status: market.status, lockAt: market.lockAt },
        eventStatus: fresh.status,
        eventStartsAt: event.startsAt,
        // The accepted price is the offer the member was shown, never the shared placeholder line row.
        line: { id: line.id, marketId: market.id, price: req.price, point: null },
        member: { credits: member.credits },
        league: { startingCredits: league.startingCredits },
        picksOnMarket: existing?.n ?? 0,
        openPickCount: risk.count,
        openStakeTotal: risk.stake,
      }
      let accepted
      try {
        accepted = acceptPick({ stake: req.stake, lineId: line.id, expectedPrice: req.price, expectedPoint: null }, ctx, { ...DEFAULT_LIMITS, maxStakePctOfStart: Math.min(league.maxStakePct, LIVE_PICK.maxStakePct), live: true })
      } catch (error) {
        if (error instanceof PickRejected) throw new SportsError(error.message, error.code === "insufficient_credits" ? 402 : 409)
        throw error
      }
      const [pick] = await tx.insert(sportsPicks).values({ leagueId, memberId: member.id, marketId: market.id, lineId: line.id, selection: req.selection, stake: accepted.stake, price: accepted.price, point: null, totalReturn: accepted.totalReturn, requestId: req.requestId, acceptedAt: accepted.acceptedAt }).returning()
      await tx.insert(sportsLedger).values({ memberId: member.id, pickId: pick!.id, type: "place", amount: -accepted.stake, idempotencyKey: placeKey(pick!.id) })
      await tx.update(sportsMembers).set({ credits: sql`${sportsMembers.credits} - ${accepted.stake}` }).where(eq(sportsMembers.id, member.id))
      return { pick: pick!, replayed: false }
    })
    emit("info", result.replayed ? "sports.live_pick_replayed" : "sports.live_pick_placed", { pickId: result.pick.id, leagueId, marketId: result.pick.marketId, stake: result.pick.stake, price: result.pick.price })
    return result
  })
}

/** Every live attempt, accepted or rejected, for later analysis. Never throws: logging must not change the outcome the member sees. */
export async function logLiveAttempt(db: Db, row: { id?: string; userId: string; leagueId: string; eventId: string; selection: string; stake: number; offeredPrice: number; requestedAt: Date; acceptedAt: Date | null; quoteAgeMs: number | null; stateAgeMs: number | null; outcome: "accepted" | "rejected"; reason: string | null; pickId: string | null; receipt: unknown }) {
  try {
    await db.insert(schema.sportsLiveTests).values({ ...row, receipt: row.receipt ?? {} }).onConflictDoNothing()
  } catch (error) {
    emit("warn", "sports.live_attempt_log_failed", { eventId: row.eventId, error: error instanceof Error ? error.message : "unknown" })
  }
}

export async function setLeagueLiveBetting(db: Db, userId: string, leagueId: string, on: boolean) {
  const [row] = await db.update(sportsLeagues).set({ liveBetting: on }).where(and(eq(sportsLeagues.id, leagueId), eq(sportsLeagues.ownerId, userId))).returning({ id: sportsLeagues.id })
  if (!row) throw new SportsError("Only the league owner can change this", 403)
  return { liveBetting: on }
}
