import { and, asc, eq, inArray, sql } from "drizzle-orm"
import * as schema from "../../db/schema.ts"
import { emit } from "./log.ts"
import { CashoutRejected, settleCashout } from "./cashout.ts"
import { isPickWindowOpen } from "./lines.ts"
import { readLiveView } from "./live/store.ts"
import type { LiveView } from "./live/view.ts"
import { parlayCashoutKey, type ParlayLegStatus } from "./parlay.ts"
import { priceParlayCashout, type ParlayCashoutLeg, type ParlayCashoutPrice } from "./parlay-cashout.ts"
import { SportsError, withDeadlockRetry, type Db } from "./store.ts"

const { sportsParlays, sportsParlayLegs, sportsMarkets, sportsEvents, sportsLines, sportsMembers, sportsLedger } = schema

export type ParlayQuote =
  | { available: true; value: number; source: "pregame" | "live" | "mixed"; stake: number; totalReturn: number }
  | { available: false; reason: string }

type LegState = {
  leg: typeof sportsParlayLegs.$inferSelect
  market: typeof sportsMarkets.$inferSelect
  event: typeof sportsEvents.$inferSelect
  line: { price: number; point: number | null } | null
}
type ParlayState = { parlay: typeof sportsParlays.$inferSelect; legs: LegState[] }

/** The caller's own parlay with its legs, their markets, games and current lines. 404 for anyone else's or an unknown one. */
async function loadParlay(db: Pick<Db, "select">, userId: string, leagueId: string, parlayId: string): Promise<ParlayState> {
  const [row] = await db
    .select({ parlay: sportsParlays })
    .from(sportsParlays)
    .innerJoin(sportsMembers, eq(sportsMembers.id, sportsParlays.memberId))
    .where(and(eq(sportsParlays.id, parlayId), eq(sportsParlays.leagueId, leagueId), eq(sportsMembers.userId, userId)))
    .limit(1)
  if (!row) throw new SportsError("Parlay not found", 404)
  const legs = await db
    .select({ leg: sportsParlayLegs, market: sportsMarkets, event: sportsEvents, line: { price: sportsLines.price, point: sportsLines.point } })
    .from(sportsParlayLegs)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsParlayLegs.marketId))
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsParlayLegs.eventId))
    .leftJoin(sportsLines, eq(sportsLines.id, sportsParlayLegs.lineId))
    .where(eq(sportsParlayLegs.parlayId, parlayId))
    .orderBy(asc(sportsParlayLegs.id))
  return { parlay: row.parlay, legs }
}

const phaseOf = (s: LegState, now: Date): ParlayCashoutLeg["phase"] =>
  isPickWindowOpen(s.market, s.event.status, now, s.event.startsAt) ? "pregame" : s.event.status === "scheduled" && now.getTime() >= s.event.startsAt.getTime() ? "live" : "closed"

/** Open legs whose game is in play need the live quote; read before any transaction so the lock hold time stays short. */
async function readViews(db: Db, state: ParlayState, now: Date): Promise<Map<string, LiveView | null>> {
  const views = new Map<string, LiveView | null>()
  for (const s of state.legs) {
    if (s.leg.status === "open" && phaseOf(s, now) === "live" && !views.has(s.event.id)) views.set(s.event.id, await readLiveView(db, s.event.id, now))
  }
  return views
}

function priceFor(state: ParlayState, now: Date, views: Map<string, LiveView | null>): ParlayCashoutPrice {
  if (state.parlay.status !== "open") return { available: false, reason: "This parlay is already settled" }
  const legs: ParlayCashoutLeg[] = state.legs.map((s) => ({
    status: s.leg.status as ParlayLegStatus,
    price: s.leg.price,
    kind: s.market.kind,
    selection: s.leg.selection,
    point: s.leg.point,
    phase: phaseOf(s, now),
    line: s.line,
    view: views.get(s.event.id) ?? null,
  }))
  return priceParlayCashout({ stake: state.parlay.stake, totalReturn: state.parlay.totalReturn }, legs)
}

/** What a member's open parlay could be sold for now. Read only. */
export async function quoteParlayCashout(db: Db, userId: string, leagueId: string, parlayId: string, now = new Date()): Promise<ParlayQuote> {
  const state = await loadParlay(db, userId, leagueId, parlayId)
  if (state.parlay.status !== "open") return { available: false, reason: "This parlay is already settled" }
  const price = priceFor(state, now, await readViews(db, state, now))
  if (!price.available) return price
  return { available: true, value: price.value, source: price.source, stake: state.parlay.stake, totalReturn: state.parlay.totalReturn }
}

/**
 * Sells a whole open parlay back for `expected` credits (the quote the member saw). Atomic, with the same lock order as the rest of
 * the sports code: every leg's market row (shared, id order), then the member row, then the parlay row. The price is recomputed
 * inside the transaction from the locked state (leg results cannot change while the market rows are held), the parlay leaves `open`
 * only by a conditional update whose row count is checked, and one ledger row with a unique key credits the balance only if it was
 * actually inserted. Settlement only ever touches open parlays, so a cashed-out parlay is never also paid as a win. A repeat of the
 * same request returns the earlier result.
 */
export function cashOutParlay(db: Db, userId: string, leagueId: string, parlayId: string, expected: number, now?: Date) {
  return withDeadlockRetry(async () => {
    const clock = now ?? new Date()
    const before = await loadParlay(db, userId, leagueId, parlayId)
    if (before.parlay.status === "cashed_out") return { amount: before.parlay.payout ?? 0, replayed: true }
    const views = await readViews(db, before, clock)
    const marketIds = [...new Set(before.legs.map((l) => l.market.id))].sort()
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: sportsMarkets.id }).from(sportsMarkets).where(inArray(sportsMarkets.id, marketIds)).orderBy(asc(sportsMarkets.id)).for("share")
      const [member] = await tx.execute<{ id: string; credits: number }>(sql`SELECT id, credits FROM sports_members WHERE league_id = ${leagueId} AND user_id = ${userId} FOR UPDATE`)
      if (!member) throw new SportsError("League not found", 404)
      const [locked] = await tx.select().from(sportsParlays).where(and(eq(sportsParlays.id, parlayId), eq(sportsParlays.memberId, member.id))).for("update")
      if (!locked) throw new SportsError("Parlay not found", 404)
      if (locked.status === "cashed_out") return { amount: locked.payout ?? 0, replayed: true }
      if (locked.status !== "open") throw new SportsError("This parlay is already settled", 409)
      const state = await loadParlay(tx, userId, leagueId, parlayId)
      const price = priceFor(state, clock, views)
      if (!price.available) throw new SportsError("Cash-out isn't available for this parlay right now", 409)
      let amount: number
      try {
        amount = settleCashout(expected, price.value)
      } catch (error) {
        if (error instanceof CashoutRejected) throw new SportsError(error.message, 409)
        throw error
      }
      const moved = await tx.update(sportsParlays).set({ status: "cashed_out", payout: amount, settledAt: clock }).where(and(eq(sportsParlays.id, parlayId), eq(sportsParlays.status, "open"))).returning({ id: sportsParlays.id })
      if (moved.length !== 1) throw new SportsError("This parlay is already settled", 409)
      const credited = await tx.insert(sportsLedger).values({ memberId: member.id, type: "cashout", amount, idempotencyKey: parlayCashoutKey(parlayId) }).onConflictDoNothing().returning({ id: sportsLedger.id })
      if (credited.length === 1) await tx.update(sportsMembers).set({ credits: sql`${sportsMembers.credits} + ${amount}` }).where(eq(sportsMembers.id, member.id))
      return { amount, replayed: false }
    })
    emit("info", result.replayed ? "sports.parlay_cashout_replayed" : "sports.parlay_cashout", { parlayId, leagueId, amount: result.amount })
    return result
  })
}
