import { and, eq, sql } from "drizzle-orm"
import * as schema from "../../db/schema.ts"
import { emit } from "./log.ts"
import { CashoutRejected, liveCashout, pregameCashout, settleCashout, type CashoutQuote } from "./cashout.ts"
import { isPickWindowOpen } from "./lines.ts"
import { readLiveView } from "./live/store.ts"
import { SportsError, withDeadlockRetry, type Db } from "./store.ts"

const { sportsPicks, sportsMarkets, sportsEvents, sportsLines, sportsMembers, sportsLedger } = schema

export const cashoutKey = (pickId: string) => `pick:${pickId}:cashout`

export type PickQuote =
  | { available: true; value: number; source: CashoutQuote["source"]; stake: number; totalReturn: number }
  | { available: false; reason: string }

type PickState = {
  pick: typeof sportsPicks.$inferSelect
  market: typeof sportsMarkets.$inferSelect
  event: typeof sportsEvents.$inferSelect
  line: { price: number; point: number | null } | null
}

async function loadPick(db: Pick<Db, "select">, userId: string, leagueId: string, pickId: string): Promise<PickState> {
  const [row] = await db
    .select({ pick: sportsPicks, market: sportsMarkets, event: sportsEvents, line: { price: sportsLines.price, point: sportsLines.point } })
    .from(sportsPicks)
    .innerJoin(sportsMembers, eq(sportsMembers.id, sportsPicks.memberId))
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .leftJoin(sportsLines, eq(sportsLines.id, sportsPicks.lineId))
    .where(and(eq(sportsPicks.id, pickId), eq(sportsPicks.leagueId, leagueId), eq(sportsMembers.userId, userId)))
    .limit(1)
  if (!row) throw new SportsError("Pick not found", 404)
  return row
}

/** The price to offer for this pick right now, from the live quote when the game is on and the market's own price before kickoff. */
function priceFor(state: PickState, now: Date, view: Awaited<ReturnType<typeof readLiveView>>): CashoutQuote | null {
  const { pick, market, event, line } = state
  if (pick.status !== "open") return null
  const asPick = { stake: pick.stake, totalReturn: pick.totalReturn, kind: market.kind, selection: pick.selection, point: pick.point }
  if (isPickWindowOpen(market, event.status, now, event.startsAt)) return pregameCashout(asPick, line, true)
  if (event.status === "scheduled" && now.getTime() >= event.startsAt.getTime()) return liveCashout(asPick, view)
  return null
}

const needsLive = (state: PickState, now: Date) => !isPickWindowOpen(state.market, state.event.status, now, state.event.startsAt) && state.event.status === "scheduled" && now.getTime() >= state.event.startsAt.getTime()

/** What a member's open pick could be sold for now, plus the current price for adding more before kickoff. Read only. */
export async function quoteCashout(db: Db, userId: string, leagueId: string, pickId: string, now = new Date()): Promise<PickQuote & { add?: { lineId: string; price: number; point: number | null } }> {
  const state = await loadPick(db, userId, leagueId, pickId)
  if (state.pick.status !== "open") return { available: false, reason: "This pick is already settled" }
  const view = needsLive(state, now) ? await readLiveView(db, state.event.id, now) : null
  const quote = priceFor(state, now, view)
  const open = isPickWindowOpen(state.market, state.event.status, now, state.event.startsAt)
  const add = open && state.line ? { lineId: state.pick.lineId, price: state.line.price, point: state.line.point } : undefined
  if (!quote) return { available: false, reason: open ? "The price isn't available right now" : "Cash-out opens when a live price is available", ...(add ? { add } : {}) }
  return { available: true, value: quote.value, source: quote.source, stake: state.pick.stake, totalReturn: state.pick.totalReturn, ...(add ? { add } : {}) }
}

/**
 * Sells an open pick back for `expected` credits (the quote the member saw). Atomic: the pick row and the member row are
 * locked, the price is recomputed inside the transaction, the pick leaves `open` exactly once, and one ledger row with a
 * unique key credits the balance. A repeat of the same request returns the earlier result. Settlement only ever touches
 * open picks, so a cashed-out pick can never also be paid as a win.
 */
export function cashOutPick(db: Db, userId: string, leagueId: string, pickId: string, expected: number, now?: Date) {
  return withDeadlockRetry(async () => {
    const clock = now ?? new Date()
    const before = await loadPick(db, userId, leagueId, pickId)
    if (before.pick.status === "cashed_out") return { amount: before.pick.cashoutAmount ?? 0, replayed: true }
    const view = needsLive(before, clock) ? await readLiveView(db, before.event.id, clock) : null
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: sportsMarkets.id }).from(sportsMarkets).where(eq(sportsMarkets.id, before.market.id)).for("share")
      const [member] = await tx.execute<{ id: string; credits: number }>(sql`SELECT id, credits FROM sports_members WHERE league_id = ${leagueId} AND user_id = ${userId} FOR UPDATE`)
      if (!member) throw new SportsError("League not found", 404)
      const [locked] = await tx.select().from(sportsPicks).where(and(eq(sportsPicks.id, pickId), eq(sportsPicks.memberId, member.id))).for("update")
      if (!locked) throw new SportsError("Pick not found", 404)
      if (locked.status === "cashed_out") return { amount: locked.cashoutAmount ?? 0, replayed: true }
      if (locked.status !== "open") throw new SportsError("This pick is already settled", 409)
      const [line] = await tx.select({ price: sportsLines.price, point: sportsLines.point }).from(sportsLines).where(eq(sportsLines.id, locked.lineId)).limit(1)
      const [market] = await tx.select().from(sportsMarkets).where(eq(sportsMarkets.id, locked.marketId)).limit(1)
      const [event] = await tx.select().from(sportsEvents).where(eq(sportsEvents.id, before.event.id)).limit(1)
      const quote = priceFor({ pick: locked, market: market!, event: event!, line: line ?? null }, clock, view)
      if (!quote) throw new SportsError("Cash-out isn't available for this pick right now", 409)
      let amount: number
      try {
        amount = settleCashout(expected, quote.value)
      } catch (error) {
        if (error instanceof CashoutRejected) throw new SportsError(error.message, 409)
        throw error
      }
      const moved = await tx.update(sportsPicks).set({ status: "cashed_out", cashoutAmount: amount, settledAt: clock }).where(and(eq(sportsPicks.id, pickId), eq(sportsPicks.status, "open"))).returning({ id: sportsPicks.id })
      if (moved.length !== 1) throw new SportsError("This pick is already settled", 409)
      const credited = await tx.insert(sportsLedger).values({ memberId: member.id, pickId, type: "cashout", amount, idempotencyKey: cashoutKey(pickId) }).onConflictDoNothing().returning({ id: sportsLedger.id })
      if (credited.length === 1) await tx.update(sportsMembers).set({ credits: sql`${sportsMembers.credits} + ${amount}` }).where(eq(sportsMembers.id, member.id))
      return { amount, replayed: false }
    })
    emit("info", result.replayed ? "sports.cashout_replayed" : "sports.cashout", { pickId, leagueId, amount: result.amount })
    return result
  })
}
