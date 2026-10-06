import "server-only"
import { after } from "next/server"
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm"
import {
  db,
  fantasyLeagues,
  fantasyMembers,
  fantasyOrders,
  fantasyPositions,
  fantasyReactions,
  fantasySnapshots,
  fantasyTrades,
  securities,
  users,
} from "@web/db"
import { rankReturns } from "@web/lib/return-display"
import { ApiError } from "@web/lib/api"
import { generateInviteCode } from "@web/lib/crypto"
import {
  applyTrade,
  checkEndChange,
  checkQueuedOrder,
  CRYPTO_UNAVAILABLE,
  fillsAtOpen,
  queuedFillDecision,
  findLedgerMismatches,
  isClosed,
  portfolioValue,
  positionStats,
  raceSeries,
  replayLedger,
  reservedCash,
  returnPct,
  roundForStorage,
  scoredValue,
  TradeRejected,
  type QueuedOrder,
  wantsSnapshot,
  type LedgerMismatch,
  type MemberState,
} from "@web/lib/fantasy-rules"
import { displaySymbol, toMarketTicker, type AssetKind } from "@web/lib/market-data"
import { ensureLivePrice, hasLiveQuotes, scheduleLiveRefresh } from "@web/lib/live-quotes"
import { isTradingSession } from "@web/lib/market-hours"
import { ensurePriced, scheduleCloseRefresh } from "@web/lib/positions"

/**
 * Fantasy leagues: everyone gets the same play cash, picks tickers, and is
 * ranked on what that cash is worth now. Stock trades fill at the live price
 * while the market is open; outside it they queue and fill after the open
 * (`fillQueuedOrders`). Crypto fills at the latest price on file any time.
 */

const n = (v: string | null | undefined) => (v == null ? 0 : Number(v))
const today = () => new Date().toISOString().slice(0, 10)

export async function createFantasyLeague(
  userId: string,
  input: { name: string; emoji: string; accent: string; startingCash: number; maxPositionPct: number | null; endsAt: Date | null },
) {
  const [league] = await db
    .insert(fantasyLeagues)
    .values({ ...input, startingCash: input.startingCash.toString(), ownerId: userId, inviteCode: generateInviteCode() })
    .returning()
  await db.insert(fantasyMembers).values({ leagueId: league!.id, userId, cash: input.startingCash.toString() })
  return league!
}

/**
 * Changes how a league looks, or extends it. Owner only (whoever created it),
 * and only while it's running: a finished league is frozen at its last standings.
 * Starting cash and the pick cap are deliberately not editable, since changing
 * them mid-season would be unfair to anyone already trading.
 */
export async function updateFantasyLeague(
  userId: string,
  leagueId: string,
  patch: { name?: string; emoji?: string; accent?: string; endsAt?: Date | null },
) {
  const { league } = await requireFantasyMember(userId, leagueId)
  if (league.ownerId !== userId) throw new ApiError("Only the league owner can edit it", 403)
  if (isClosed(league.endsAt)) throw new ApiError("This league has finished, so it can't be edited", 409)
  if (patch.endsAt !== undefined) {
    const problem = checkEndChange(league.endsAt, patch.endsAt)
    if (problem) throw new ApiError(problem, 422)
  }

  const values = {
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.emoji !== undefined && { emoji: patch.emoji }),
    ...(patch.accent !== undefined && { accent: patch.accent }),
    ...(patch.endsAt !== undefined && { endsAt: patch.endsAt }),
  }
  if (Object.keys(values).length === 0) return { name: league.name, emoji: league.emoji, accent: league.accent, endsAt: league.endsAt }

  const [updated] = await db.update(fantasyLeagues).set(values).where(eq(fantasyLeagues.id, leagueId)).returning()
  return { name: updated!.name, emoji: updated!.emoji, accent: updated!.accent, endsAt: updated!.endsAt }
}

export async function joinFantasyLeague(userId: string, inviteCode: string) {
  const league = await db.query.fantasyLeagues.findFirst({ where: eq(fantasyLeagues.inviteCode, inviteCode.trim().toUpperCase()) })
  if (!league) throw new ApiError("That invite code doesn't match a league", 404)
  if (isClosed(league.endsAt)) throw new ApiError("This league has already finished", 409)

  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fantasyMembers)
    .where(eq(fantasyMembers.leagueId, league.id))) as [{ count: number }]
  if (count >= league.memberLimit) throw new ApiError("This league is full", 409)

  await db
    .insert(fantasyMembers)
    .values({ leagueId: league.id, userId, cash: league.startingCash })
    .onConflictDoNothing()
  return league
}

/** The league a code points at, for the join page. Safe to show before joining. */
export async function previewFantasyLeague(inviteCode: string) {
  const league = await db.query.fantasyLeagues.findFirst({ where: eq(fantasyLeagues.inviteCode, inviteCode.trim().toUpperCase()) })
  if (!league) return null
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fantasyMembers)
    .where(eq(fantasyMembers.leagueId, league.id))) as [{ count: number }]
  return { id: league.id, name: league.name, emoji: league.emoji, startingCash: n(league.startingCash), endsAt: league.endsAt, memberCount: count }
}

export async function requireFantasyMember(userId: string, leagueId: string) {
  const league = await db.query.fantasyLeagues.findFirst({ where: eq(fantasyLeagues.id, leagueId) })
  if (!league) throw new ApiError("League not found", 404)
  const member = await db.query.fantasyMembers.findFirst({
    where: and(eq(fantasyMembers.leagueId, leagueId), eq(fantasyMembers.userId, userId)),
  })
  if (!member) throw new ApiError("You are not in this league", 403)
  return { league, member }
}

export async function listFantasyLeaguesForUser(userId: string) {
  const rows = await db
    .select({ league: fantasyLeagues, memberId: fantasyMembers.id })
    .from(fantasyMembers)
    .innerJoin(fantasyLeagues, eq(fantasyMembers.leagueId, fantasyLeagues.id))
    .where(eq(fantasyMembers.userId, userId))
    .orderBy(desc(fantasyLeagues.createdAt))
  if (rows.length === 0) return []
  scheduleCloseRefresh()
  scheduleLiveRefresh()

  const ids = rows.map((r) => r.league.id)
  // Everyone in these leagues, so your rank is worked out the same way the league page ranks.
  const everyone = await db
    .select({ id: fantasyMembers.id, leagueId: fantasyMembers.leagueId })
    .from(fantasyMembers)
    .where(inArray(fantasyMembers.leagueId, ids))
  const everyoneIds = everyone.map((m) => m.id)
  const [values, lastSnapshots] = await Promise.all([memberValues(everyoneIds), latestSnapshots(everyoneIds)])

  return rows.map(({ league, memberId }) => {
    const startingCash = n(league.startingCash)
    // Scored the same way as the league page, so a finished league shows its final return here too.
    const scored = (id: string) => returnPct(scoredValue(league.endsAt, lastSnapshots.get(id) ?? [], values.get(id) ?? startingCash), startingCash)
    const members = everyone.filter((m) => m.leagueId === league.id)
    const standings = rankReturns(members.map((m) => ({ id: m.id, percent: scored(m.id) })))
    return {
      id: league.id,
      name: league.name,
      emoji: league.emoji,
      accent: league.accent,
      endsAt: league.endsAt,
      isClosed: isClosed(league.endsAt),
      memberCount: members.length || 1,
      yourReturn: scored(memberId),
      yourRank: standings.find((s) => s.id === memberId)?.rank ?? null,
    }
  })
}

type PositionRow = { memberId: string; securityId: string; ticker: string; name: string | null; shares: number; costBasis: number; price: number; priceAsOf: string | null }

async function loadPositions(memberIds: string[]): Promise<PositionRow[]> {
  if (memberIds.length === 0) return []
  const rows = await db
    .select({
      memberId: fantasyPositions.memberId,
      securityId: fantasyPositions.securityId,
      ticker: securities.tickerSymbol,
      marketTicker: securities.marketTicker,
      name: securities.name,
      shares: fantasyPositions.shares,
      costBasis: fantasyPositions.costBasis,
      price: securities.closePrice,
      priceAsOf: securities.closePriceAsOf,
    })
    .from(fantasyPositions)
    .innerJoin(securities, eq(fantasyPositions.securityId, securities.id))
    .where(inArray(fantasyPositions.memberId, memberIds))
  return rows.map((r) => ({
    memberId: r.memberId,
    securityId: r.securityId,
    ticker: r.ticker ?? displaySymbol(r.marketTicker ?? r.securityId),
    name: r.name,
    shares: n(r.shares),
    costBasis: n(r.costBasis),
    price: n(r.price),
    priceAsOf: r.priceAsOf,
  }))
}

/** Each member's most recent snapshot, as a one-entry history (empty when there is none). */
async function latestSnapshots(memberIds: string[]): Promise<Map<string, { date: string; value: number }[]>> {
  const out = new Map<string, { date: string; value: number }[]>()
  if (memberIds.length === 0) return out
  const rows = await db
    .selectDistinctOn([fantasySnapshots.memberId], { memberId: fantasySnapshots.memberId, date: fantasySnapshots.date, value: fantasySnapshots.value })
    .from(fantasySnapshots)
    .where(inArray(fantasySnapshots.memberId, memberIds))
    .orderBy(fantasySnapshots.memberId, desc(fantasySnapshots.date))
  for (const r of rows) out.set(r.memberId, [{ date: r.date, value: n(r.value) }])
  return out
}

/** Current value (cash plus positions at the latest close) per member. */
async function memberValues(memberIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (memberIds.length === 0) return out
  const [members, positions] = await Promise.all([
    db.select({ id: fantasyMembers.id, cash: fantasyMembers.cash }).from(fantasyMembers).where(inArray(fantasyMembers.id, memberIds)),
    loadPositions(memberIds),
  ])
  for (const m of members) out.set(m.id, n(m.cash))
  for (const p of positions) out.set(p.memberId, (out.get(p.memberId) ?? 0) + p.shares * p.price)
  return out
}

/** Places a trade at the latest close. Serialized per member with a row lock. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Cash a member has set aside for buys waiting for the open, leaving out `exceptOrderId` (the one being filled). */
async function reservedFor(tx: Tx, memberId: string, exceptOrderId?: string) {
  const rows = await tx
    .select({ side: fantasyOrders.side, amount: fantasyOrders.amount, id: fantasyOrders.id })
    .from(fantasyOrders)
    .where(and(eq(fantasyOrders.memberId, memberId), eq(fantasyOrders.status, "pending")))
  return reservedCash(rows.filter((o) => o.id !== exceptOrderId).map((o) => ({ side: o.side, amount: o.amount === null ? null : n(o.amount) })))
}

/**
 * Fills one trade at `price` inside `tx`: locks the member's cash, checks the
 * rules, and writes cash, position and the trade log. Throws {@link TradeRejected}.
 */
async function executeTrade(
  tx: Tx,
  t: {
    leagueId: string
    memberId: string
    maxPositionPct: number | null
    securityId: string
    price: number
    asOf: string
    exceptOrderId?: string
  } & QueuedOrder,
) {
  const [locked] = await tx.execute<{ cash: string }>(sql`SELECT cash FROM fantasy_members WHERE id = ${t.memberId} FOR UPDATE`)
  const held = await tx
    .select({ securityId: fantasyPositions.securityId, shares: fantasyPositions.shares, costBasis: fantasyPositions.costBasis, price: securities.closePrice })
    .from(fantasyPositions)
    .innerJoin(securities, eq(fantasyPositions.securityId, securities.id))
    .where(eq(fantasyPositions.memberId, t.memberId))

  const state: MemberState = {
    cash: n(locked?.cash),
    positions: held.map((h) => ({ securityId: h.securityId, shares: n(h.shares), costBasis: n(h.costBasis), price: n(h.price) })),
  }

  const outcome = applyTrade(
    state,
    t.side === "buy"
      ? { side: "buy", securityId: t.securityId, price: t.price, amount: t.amount }
      : { side: "sell", securityId: t.securityId, price: t.price, shares: t.shares },
    { maxPositionPct: t.maxPositionPct, reservedCash: await reservedFor(tx, t.memberId, t.exceptOrderId) },
  )

  // The same rounding the tests use, so what they prove is what gets stored.
  const stored = roundForStorage(outcome)

  await tx
    .update(fantasyMembers)
    .set({ cash: sql`${fantasyMembers.cash} + ${stored.cashDelta}::numeric` })
    .where(eq(fantasyMembers.id, t.memberId))

  if (stored.position) {
    await tx
      .insert(fantasyPositions)
      .values({ memberId: t.memberId, securityId: t.securityId, shares: stored.position.shares, costBasis: stored.position.costBasis })
      .onConflictDoUpdate({
        target: [fantasyPositions.memberId, fantasyPositions.securityId],
        set: { shares: stored.position.shares, costBasis: stored.position.costBasis, updatedAt: new Date() },
      })
  } else {
    await tx
      .delete(fantasyPositions)
      .where(and(eq(fantasyPositions.memberId, t.memberId), eq(fantasyPositions.securityId, t.securityId)))
  }

  const [trade] = await tx
    .insert(fantasyTrades)
    .values({
      leagueId: t.leagueId,
      memberId: t.memberId,
      securityId: t.securityId,
      side: t.side,
      shares: stored.shares,
      price: t.price.toString(),
      priceAsOf: t.asOf,
    })
    .returning()
  return { trade: trade!, shares: outcome.shares }
}

export async function placeTrade(
  userId: string,
  leagueId: string,
  input: { symbol: string; kind: AssetKind } & QueuedOrder,
) {
  const { league, member } = await requireFantasyMember(userId, leagueId)
  if (isClosed(league.endsAt)) throw new ApiError("This league has finished. Trading is closed.", 409)

  const marketTicker = toMarketTicker(input.symbol, input.kind)
  if (!marketTicker) throw new ApiError(`${input.symbol} doesn't look like a ${input.kind === "crypto" ? "coin" : "ticker"}`)

  // Every fill needs a live price, and crypto only ever has a daily one.
  if (input.kind === "crypto") throw new ApiError(CRYPTO_UNAVAILABLE, 422)
  // Without a live source no order could ever fill, so don't take one.
  if (!hasLiveQuotes()) throw new ApiError("Live prices aren't available right now, so stock trading is paused.", 503)

  // Outside the transaction: for a ticker we've never priced this calls the
  // providers, to prove it exists and create its price row. A stored close is
  // never a fill price, so a known ticker needs no refresh (and a daily-price
  // outage can't block trading).
  const { securityId } = await ensurePriced(marketTicker, input.kind)

  // One clock for the hours check and the live lookup, so a trade placed as the
  // bell rings can't pass the check and then miss the live price.
  const now = new Date()
  if (fillsAtOpen(input.kind, now)) return queueOrder(league.id, member.id, securityId, marketTicker, input, now, "closed")

  // Fill at a price printed in this session, fetched just now, and store it for
  // everyone so the fill and every valuation agree and a buy can't show an
  // instant gain. With no such price (an outage, a halt, an unlisted holiday)
  // the order waits for one instead of falling back to an old close.
  const live = await ensureLivePrice(marketTicker, { now })
  if (!live) return queueOrder(league.id, member.id, securityId, marketTicker, input, now, "no-live-price")

  try {
    const { trade, shares } = await db.transaction((tx) =>
      executeTrade(tx, { ...input, leagueId, memberId: member.id, maxPositionPct: league.maxPositionPct, securityId, price: live.price, asOf: live.asOf }),
    )
    return { trade, ticker: displaySymbol(marketTicker), price: live.price, priceAsOf: live.asOf, shares }
  } catch (error) {
    if (error instanceof TradeRejected) throw new ApiError(error.message, 422)
    throw error
  }
}

/**
 * Puts a stock order in line for the next live price: after the open when the
 * market is closed, or as soon as the provider answers when it didn't. Nothing
 * moves until it fills; a buy's cash is set aside.
 */
async function queueOrder(
  leagueId: string,
  memberId: string,
  securityId: string,
  marketTicker: string,
  order: QueuedOrder,
  now: Date,
  why: "closed" | "no-live-price",
) {
  const queued = await db.transaction(async (tx) => {
    // Serializes this member's queueing and trading, so two quick orders can't both spend the same cash.
    const [locked] = await tx.execute<{ cash: string }>(sql`SELECT cash FROM fantasy_members WHERE id = ${memberId} FOR UPDATE`)
    const pending = await tx
      .select({ side: fantasyOrders.side, amount: fantasyOrders.amount, shares: fantasyOrders.shares, securityId: fantasyOrders.securityId })
      .from(fantasyOrders)
      .where(and(eq(fantasyOrders.memberId, memberId), eq(fantasyOrders.status, "pending")))
    const [position] = await tx
      .select({ shares: fantasyPositions.shares })
      .from(fantasyPositions)
      .where(and(eq(fantasyPositions.memberId, memberId), eq(fantasyPositions.securityId, securityId)))

    const sells = pending.filter((o) => o.side === "sell" && o.securityId === securityId)
    const problem = checkQueuedOrder(order, {
      availableCash: n(locked?.cash) - reservedCash(pending.map((o) => ({ side: o.side, amount: o.amount === null ? null : n(o.amount) }))),
      heldShares: n(position?.shares),
      queuedSellShares: sells.some((o) => o.shares === null) ? "all" : sells.reduce((sum, o) => sum + n(o.shares), 0),
      pendingCount: pending.length,
    })
    if (problem) throw new ApiError(problem, 422)

    const [row] = await tx
      .insert(fantasyOrders)
      .values({
        leagueId,
        memberId,
        securityId,
        side: order.side,
        amount: order.side === "buy" ? order.amount.toFixed(2) : null,
        shares: order.side === "sell" && order.shares !== "all" ? order.shares.toString() : null,
        // The same clock the fill compares prints against.
        createdAt: now,
      })
      .returning()
    return row!
  })
  return { queued: true as const, why, orderId: queued.id, ticker: displaySymbol(marketTicker), side: order.side }
}

/** Takes back an order that hasn't filled yet. */
export async function cancelOrder(userId: string, leagueId: string, orderId: string) {
  const { member } = await requireFantasyMember(userId, leagueId)
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new ApiError("Order not found", 404)
  const [cancelled] = await db
    .update(fantasyOrders)
    .set({ status: "cancelled", settledAt: new Date() })
    .where(and(eq(fantasyOrders.id, orderId), eq(fantasyOrders.memberId, member.id), eq(fantasyOrders.status, "pending")))
    .returning({ id: fantasyOrders.id })
  if (!cancelled) throw new ApiError("That order has already filled or been cancelled", 409)
  return { cancelled: cancelled.id }
}

/** Most queued orders one run settles; the rest wait for the next run a few minutes later. */
const MAX_FILLS_PER_RUN = 100

/**
 * Settles orders that are waiting for a live price. During the regular session
 * each ticker's price is fetched fresh, and an order fills only at a print made
 * in the session after the order was placed (`queuedFillDecision`), so the
 * first fill after the open is at a real opening-session trade, never at last
 * night's close or a pre-market print. Each fill goes through the same checks
 * as a trade placed live, so one that no longer fits (not enough cash, over the
 * pick cap, shares sold meanwhile) is rejected with the reason. Orders in a
 * finished league are cancelled and ones that never get a price expire, at any
 * hour. Safe to run from any number of servers at once: each order is locked
 * and re-checked before it settles, so it can't fill twice.
 */
export async function fillQueuedOrders({ now = new Date() }: { now?: Date } = {}) {
  const pending = await db
    .select({
      id: fantasyOrders.id,
      leagueId: fantasyOrders.leagueId,
      memberId: fantasyOrders.memberId,
      securityId: fantasyOrders.securityId,
      side: fantasyOrders.side,
      amount: fantasyOrders.amount,
      shares: fantasyOrders.shares,
      createdAt: fantasyOrders.createdAt,
      marketTicker: securities.marketTicker,
      endsAt: fantasyLeagues.endsAt,
      maxPositionPct: fantasyLeagues.maxPositionPct,
    })
    .from(fantasyOrders)
    .innerJoin(securities, eq(fantasyOrders.securityId, securities.id))
    .innerJoin(fantasyLeagues, eq(fantasyOrders.leagueId, fantasyLeagues.id))
    .where(eq(fantasyOrders.status, "pending"))
    .orderBy(asc(fantasyOrders.createdAt))
    .limit(MAX_FILLS_PER_RUN)
  if (pending.length === 0) return { pending: 0, filled: 0, rejected: 0 }

  // One fresh price per ticker, shared by every order for it (and stored for
  // everyone's valuation). Never a stored one: its print time isn't known.
  const prices = new Map<string, { price: number; asOf: string; printedAt?: string } | null>()
  if (isTradingSession(now)) {
    for (const ticker of new Set(pending.map((o) => o.marketTicker).filter((t): t is string => !!t))) {
      prices.set(ticker, await ensureLivePrice(ticker, { now }))
    }
  }

  let filled = 0
  let rejected = 0
  for (const order of pending) {
    const live = order.marketTicker ? prices.get(order.marketTicker) ?? null : null
    const decision = queuedFillDecision(
      { createdAt: order.createdAt, leagueEndsAt: order.endsAt },
      live?.printedAt ? new Date(live.printedAt) : null,
      now,
    )
    if (decision.action === "wait") continue

    const outcome = await db.transaction(async (tx) => {
      const [current] = await tx.execute<{ status: string }>(sql`SELECT status FROM fantasy_orders WHERE id = ${order.id} FOR UPDATE`)
      if (current?.status !== "pending") return "skipped" as const
      const settle = (values: Partial<typeof fantasyOrders.$inferInsert>) =>
        tx.update(fantasyOrders).set({ ...values, settledAt: new Date() }).where(eq(fantasyOrders.id, order.id))

      if (decision.action !== "fill") {
        await settle({ status: decision.action === "cancel" ? "cancelled" : "rejected", reason: decision.reason })
        return "rejected" as const
      }
      const request: QueuedOrder =
        order.side === "buy" ? { side: "buy", amount: n(order.amount) } : { side: "sell", shares: order.shares === null ? "all" : n(order.shares) }
      try {
        const { trade } = await executeTrade(tx, {
          ...request,
          leagueId: order.leagueId,
          memberId: order.memberId,
          maxPositionPct: order.maxPositionPct,
          securityId: order.securityId,
          price: live!.price,
          asOf: live!.asOf,
          exceptOrderId: order.id,
        })
        await settle({ status: "filled", tradeId: trade.id })
        return "filled" as const
      } catch (error) {
        if (!(error instanceof TradeRejected)) throw error
        await settle({ status: "rejected", reason: error.message })
        return "rejected" as const
      }
    })
    if (outcome === "filled") filled++
    if (outcome === "rejected") rejected++
  }
  return { pending: pending.length, filled, rejected }
}

/** Runs {@link fillQueuedOrders} after the response is sent, so a page load never waits on it. */
export function scheduleOrderFills() {
  try {
    after(async () => {
      try {
        const run = await fillQueuedOrders()
        if (run.filled > 0 || run.rejected > 0) console.info("[orders]", JSON.stringify(run))
      } catch (error) {
        console.error("[orders] filling queued orders failed:", error instanceof Error ? error.message : error)
      }
    })
  } catch {
    // Outside a request there is nothing to attach to; the next request or cron run will do it.
  }
}

export type FantasyStanding = {
  userId: string
  name: string | null
  handle: string | null
  image: string | null
  rank: number
  percent: number
  days: number
  spark: number[]
  hasHistory: boolean
  shareHoldings: boolean
  isVerified: boolean
  holdings: { ticker: string; name: string | null; weight: number }[]
  reactions: Record<string, number>
  isYou: boolean
  value: number
  cash: number
}

/** Everything the league page needs in one go: standings, your book, the feed. */
export async function loadFantasyLeague(userId: string, leagueId: string) {
  const { league, member: me } = await requireFantasyMember(userId, leagueId)
  const startingCash = n(league.startingCash)
  // A finished league is frozen at its last snapshot, so only live ones need fresh prices.
  if (!isClosed(league.endsAt)) {
    scheduleCloseRefresh()
    scheduleLiveRefresh()
    scheduleOrderFills()
  }

  const members = await db
    .select({ id: fantasyMembers.id, cash: fantasyMembers.cash, userId: users.id, name: users.name, handle: users.handle, image: users.image })
    .from(fantasyMembers)
    .innerJoin(users, eq(fantasyMembers.userId, users.id))
    .where(eq(fantasyMembers.leagueId, leagueId))
  const memberIds = members.map((m) => m.id)

  const [positions, snapshots, feed, reactionRows, orders] = await Promise.all([
    loadPositions(memberIds),
    db.execute<{ memberId: string; date: string; value: string; pastDays: number }>(sql`
      WITH history AS (
        SELECT member_id AS "memberId", date::text AS date, value,
          row_number() OVER (PARTITION BY member_id ORDER BY date) AS rn,
          count(*) OVER (PARTITION BY member_id) AS n,
          (count(*) FILTER (WHERE date <> ${today()}::date) OVER (PARTITION BY member_id))::int AS "pastDays",
          min(date) FILTER (WHERE date >= ${league.endsAt?.toISOString().slice(0, 10) ?? "9999-12-31"}::date)
            OVER (PARTITION BY member_id) AS final_date
        FROM fantasy_snapshots WHERE member_id IN (${sql.join(memberIds.map(id => sql`${id}::uuid`), sql`, `)})
      ) SELECT "memberId", date, value, "pastDays" FROM history
        WHERE rn = 1 OR rn = n OR date::date = final_date
          OR rn % greatest(1, ceil(n / 360.0)::bigint) = 0
        ORDER BY date
    `),
    loadFeed(leagueId),
    db
      .select({ toMemberId: fantasyReactions.toMemberId, emoji: fantasyReactions.emoji, count: sql<number>`count(*)::int` })
      .from(fantasyReactions)
      .where(inArray(fantasyReactions.toMemberId, memberIds))
      .groupBy(fantasyReactions.toMemberId, fantasyReactions.emoji),
    loadOrders(me.id),
  ])

  const positionsBy = new Map<string, PositionRow[]>()
  for (const p of positions) { const rows = positionsBy.get(p.memberId) ?? []; rows.push(p); positionsBy.set(p.memberId, rows) }
  const historyBy = new Map<string, { date: string; value: number }[]>()
  const pastDaysBy = new Map<string, number>()
  for (const s of snapshots) { const rows = historyBy.get(s.memberId) ?? []; rows.push({ date: s.date, value: n(s.value) }); historyBy.set(s.memberId, rows); pastDaysBy.set(s.memberId, s.pastDays) }
  const reactionsByMember = new Map<string, Record<string, number>>()
  for (const reaction of reactionRows) {
    const bucket = reactionsByMember.get(reaction.toMemberId) ?? {}
    bucket[reaction.emoji] = reaction.count
    reactionsByMember.set(reaction.toMemberId, bucket)
  }

  const standings: FantasyStanding[] = rankReturns(members
    .map((m) => {
      const held = positionsBy.get(m.id) ?? []
      const cash = n(m.cash)
      const allHistory = historyBy.get(m.id) ?? []
      // A finished league is scored at its final nightly value, not today's prices.
      const value = scoredValue(league.endsAt, allHistory, portfolioValue({ cash, positions: held }))
      const invested = value - cash
      const history = (historyBy.get(m.id) ?? []).filter((h) => h.date !== today())
      // Everyone starts at 100 on day one; the last point is live.
      const spark = raceSeries(history.map((h) => h.value), value, startingCash)
      return {
        userId: m.userId,
        name: m.name,
        handle: m.handle,
        image: m.image,
        rank: 0,
        percent: returnPct(value, startingCash),
        days: (pastDaysBy.get(m.id) ?? 0) + 1,
        spark,
        hasHistory: true,
        shareHoldings: true,
        isVerified: false,
        // Picks are the whole game here, so they're always visible to the league.
        holdings:
          invested > 0
            ? held
                .map((p) => ({ ticker: p.ticker, name: p.name, weight: ((p.shares * p.price) / value) * 100 }))
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 5)
            : [],
        reactions: reactionsByMember.get(m.id) ?? {},
        isYou: m.userId === userId,
        value,
        cash,
      }
    }),
  )

  const mine = (positionsBy.get(me.id) ?? []).map((p) => ({
    ticker: p.ticker,
    name: p.name,
    shares: p.shares,
    price: p.price,
    priceAsOf: p.priceAsOf,
    ...positionStats(p, p.price),
  }))

  const you = standings.find((s) => s.isYou)!
  // Cash set aside for queued buys shows as the pending pick, not as spendable cash. Value is unchanged.
  const reserved = reservedCash(orders.filter((o) => o.status === "pending"))

  return {
    league: {
      id: league.id,
      name: league.name,
      emoji: league.emoji,
      accent: league.accent,
      inviteCode: league.inviteCode,
      startingCash,
      maxPositionPct: league.maxPositionPct,
      endsAt: league.endsAt,
      isClosed: isClosed(league.endsAt),
      isOwner: league.ownerId === userId,
    },
    standings,
    you: { cash: you.cash - reserved, value: you.value, percent: you.percent, rank: you.rank, positions: mine.sort((a, b) => b.value - a.value), orders },
    feed,
  }
}

export type OrderItem = {
  id: string
  side: "buy" | "sell"
  ticker: string
  name: string | null
  /** Dollars, for a buy. */
  amount: number | null
  /** Shares, for a sell; null sells everything. */
  shares: number | null
  /** Latest price on file, for a rough idea of what the order is worth. */
  price: number
  status: "pending" | "rejected" | "cancelled"
  reason: string | null
  at: string
}

/** How long an order that didn't fill stays on screen with its reason. */
const SHOW_UNFILLED_HOURS = 24

/** A member's orders still waiting for the open, plus any the system turned down recently (with why). */
async function loadOrders(memberId: string): Promise<OrderItem[]> {
  const since = new Date(Date.now() - SHOW_UNFILLED_HOURS * 3_600_000)
  const rows = await db
    .select({
      id: fantasyOrders.id,
      side: fantasyOrders.side,
      amount: fantasyOrders.amount,
      shares: fantasyOrders.shares,
      status: fantasyOrders.status,
      reason: fantasyOrders.reason,
      at: fantasyOrders.createdAt,
      ticker: securities.tickerSymbol,
      marketTicker: securities.marketTicker,
      name: securities.name,
      price: securities.closePrice,
    })
    .from(fantasyOrders)
    .innerJoin(securities, eq(fantasyOrders.securityId, securities.id))
    .where(
      and(
        eq(fantasyOrders.memberId, memberId),
        or(
          eq(fantasyOrders.status, "pending"),
          // Cancelled by the system (league ended) carries a reason; ones you cancelled don't.
          and(inArray(fantasyOrders.status, ["rejected", "cancelled"]), sql`${fantasyOrders.reason} IS NOT NULL`, gt(fantasyOrders.settledAt, since)),
        ),
      ),
    )
    .orderBy(asc(fantasyOrders.createdAt))
  return rows.map((r) => ({
    id: r.id,
    side: r.side,
    ticker: r.ticker ?? displaySymbol(r.marketTicker ?? "?"),
    name: r.name,
    amount: r.amount === null ? null : n(r.amount),
    shares: r.shares === null ? null : n(r.shares),
    price: n(r.price),
    status: r.status as OrderItem["status"],
    reason: r.reason,
    at: r.at.toISOString(),
  }))
}

export type FeedItem = { id: string; name: string | null; handle: string | null; image: string | null; side: "buy" | "sell"; ticker: string; shares: number; price: number; at: string }

async function loadFeed(leagueId: string, limit = 30): Promise<FeedItem[]> {
  const rows = await db
    .select({
      id: fantasyTrades.id,
      side: fantasyTrades.side,
      shares: fantasyTrades.shares,
      price: fantasyTrades.price,
      at: fantasyTrades.createdAt,
      ticker: securities.tickerSymbol,
      name: users.name,
      handle: users.handle,
      image: users.image,
    })
    .from(fantasyTrades)
    .innerJoin(fantasyMembers, eq(fantasyTrades.memberId, fantasyMembers.id))
    .innerJoin(users, eq(fantasyMembers.userId, users.id))
    .innerJoin(securities, eq(fantasyTrades.securityId, securities.id))
    .where(eq(fantasyTrades.leagueId, leagueId))
    .orderBy(desc(fantasyTrades.createdAt))
    .limit(limit)
  return rows.map((r) => ({ ...r, ticker: r.ticker ?? "?", shares: n(r.shares), price: n(r.price), at: r.at.toISOString() }))
}

/**
 * Nightly: one value per member of every open league, after repricing. A league
 * that has just finished gets one more, its final value (taken after the end,
 * so the last day counts); after that it keeps the snapshots it had, which is
 * what freezes it.
 */
export async function snapshotFantasy() {
  const all = await db
    .select({ memberId: fantasyMembers.id, endsAt: fantasyLeagues.endsAt })
    .from(fantasyMembers)
    .innerJoin(fantasyLeagues, eq(fantasyMembers.leagueId, fantasyLeagues.id))
  const last = await latestSnapshots(all.filter((m) => isClosed(m.endsAt)).map((m) => m.memberId))
  const ids = all.filter((m) => wantsSnapshot(m.endsAt, last.get(m.memberId)?.[0]?.date ?? null)).map((m) => m.memberId)
  const values = await memberValues(ids)
  const date = today()
  const entries = [...values].map(([memberId, value]) => ({ memberId, date, value: value.toFixed(6) }))
  for (let offset = 0; offset < entries.length; offset += 500) await db.insert(fantasySnapshots).values(entries.slice(offset, offset + 500))
    .onConflictDoUpdate({ target: [fantasySnapshots.memberId, fantasySnapshots.date], set: { value: sql`excluded.value` } })
  return { members: values.size }
}

export type IntegrityReport = {
  members: number
  mismatches: (LedgerMismatch & { memberId: string })[]
  badPrices: { securityId: string; reason: "missing" | "stale" }[]
}

/** A held price older than this is a data problem, not a weekend: it spans a long weekend plus a holiday. */
const MAX_PRICE_AGE_DAYS = 6

/**
 * Proves the numbers behind the standings, so an error is caught by us and not
 * by a player: every member's stored cash and positions are rebuilt from their
 * trade log and compared, and every held price is checked to exist and be
 * recent. Runs with the nightly job; any finding makes that run report failure.
 */
export async function checkFantasyIntegrity(now = new Date(), memberIds?: string[]): Promise<IntegrityReport> {
  if (memberIds?.length === 0) return { members: 0, mismatches: [], badPrices: [] }
  const [members, trades, positions, held] = await db.transaction(tx => Promise.all([
    tx
      .select({ id: fantasyMembers.id, cash: fantasyMembers.cash, startingCash: fantasyLeagues.startingCash })
      .from(fantasyMembers)
      .innerJoin(fantasyLeagues, eq(fantasyMembers.leagueId, fantasyLeagues.id))
      .where(memberIds ? inArray(fantasyMembers.id, memberIds) : undefined),
    tx
      .select({ memberId: fantasyTrades.memberId, securityId: fantasyTrades.securityId, side: fantasyTrades.side, shares: fantasyTrades.shares, price: fantasyTrades.price })
      .from(fantasyTrades)
      .where(memberIds ? inArray(fantasyTrades.memberId, memberIds) : undefined)
      .orderBy(asc(fantasyTrades.createdAt)),
    tx
      .select({ memberId: fantasyPositions.memberId, securityId: fantasyPositions.securityId, shares: fantasyPositions.shares, costBasis: fantasyPositions.costBasis })
      .from(fantasyPositions)
      .where(memberIds ? inArray(fantasyPositions.memberId, memberIds) : undefined),
    tx
      .selectDistinct({ id: securities.id, price: securities.closePrice, asOf: securities.closePriceAsOf })
      .from(fantasyPositions)
      .innerJoin(securities, eq(fantasyPositions.securityId, securities.id))
      .where(memberIds ? inArray(fantasyPositions.memberId, memberIds) : undefined),
  ]), { isolationLevel: "repeatable read", accessMode: "read only" })

  const tradesBy = new Map<string, { securityId: string; side: "buy" | "sell"; shares: number; price: number }[]>()
  for (const t of trades) {
    const list = tradesBy.get(t.memberId) ?? []
    list.push({ securityId: t.securityId, side: t.side as "buy" | "sell", shares: n(t.shares), price: n(t.price) })
    tradesBy.set(t.memberId, list)
  }
  const positionsBy = new Map<string, { securityId: string; shares: number; costBasis: number }[]>()
  for (const p of positions) {
    const list = positionsBy.get(p.memberId) ?? []
    list.push({ securityId: p.securityId, shares: n(p.shares), costBasis: n(p.costBasis) })
    positionsBy.set(p.memberId, list)
  }

  const mismatches: IntegrityReport["mismatches"] = []
  for (const m of members) {
    const replayed = replayLedger(n(m.startingCash), tradesBy.get(m.id) ?? [])
    const found = findLedgerMismatches({ cash: n(m.cash), positions: positionsBy.get(m.id) ?? [] }, replayed)
    for (const f of found) mismatches.push({ memberId: m.id, ...f })
  }

  const badPrices: IntegrityReport["badPrices"] = []
  for (const s of held) {
    if (!(n(s.price) > 0) || !s.asOf) {
      badPrices.push({ securityId: s.id, reason: "missing" })
    } else if ((now.getTime() - new Date(`${String(s.asOf).slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000 > MAX_PRICE_AGE_DAYS) {
      badPrices.push({ securityId: s.id, reason: "stale" })
    }
  }

  return { members: members.length, mismatches, badPrices }
}
