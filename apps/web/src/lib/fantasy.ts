import "server-only"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import {
  db,
  fantasyLeagues,
  fantasyMembers,
  fantasyPositions,
  fantasySnapshots,
  fantasyTrades,
  securities,
  users,
} from "@web/db"
import { rankReturns } from "@web/lib/return-display"
import { ApiError } from "@web/lib/api"
import { generateInviteCode } from "@web/lib/crypto"
import { applyTrade, isClosed, portfolioValue, returnPct, TradeRejected, type MemberState } from "@web/lib/fantasy-rules"
import { displaySymbol, toMarketTicker, type AssetKind } from "@web/lib/market-data"
import { ensurePriced, refreshStalePrices } from "@web/lib/positions"

/**
 * Fantasy leagues: everyone gets the same play cash, picks tickers, and is
 * ranked on what that cash is worth now. Prices are daily closes, the same ones
 * manual accounts use, so a trade fills at the latest close.
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
  await refreshStalePrices()

  const ids = rows.map((r) => r.league.id)
  const [counts, values] = await Promise.all([
    db
      .select({ leagueId: fantasyMembers.leagueId, count: sql<number>`count(*)::int` })
      .from(fantasyMembers)
      .where(inArray(fantasyMembers.leagueId, ids))
      .groupBy(fantasyMembers.leagueId),
    memberValues(rows.map((r) => r.memberId)),
  ])
  const countBy = new Map(counts.map((c) => [c.leagueId, c.count]))

  return rows.map(({ league, memberId }) => ({
    id: league.id,
    name: league.name,
    emoji: league.emoji,
    accent: league.accent,
    endsAt: league.endsAt,
    isClosed: isClosed(league.endsAt),
    memberCount: countBy.get(league.id) ?? 1,
    yourReturn: returnPct(values.get(memberId) ?? n(league.startingCash), n(league.startingCash)),
  }))
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
export async function placeTrade(
  userId: string,
  leagueId: string,
  input: { symbol: string; kind: AssetKind } & ({ side: "buy"; amount: number } | { side: "sell"; shares: number | "all" }),
) {
  const { league, member } = await requireFantasyMember(userId, leagueId)
  if (isClosed(league.endsAt)) throw new ApiError("This league has finished. Trading is closed.", 409)

  const marketTicker = toMarketTicker(input.symbol, input.kind)
  if (!marketTicker) throw new ApiError(`${input.symbol} doesn't look like a ${input.kind === "crypto" ? "coin" : "ticker"}`)

  // Outside the transaction: this may call the price provider.
  const priced = await ensurePriced(marketTicker, input.kind, { maxAgeHours: 20 })

  return db.transaction(async (tx) => {
    const [locked] = await tx.execute<{ cash: string }>(sql`SELECT cash FROM fantasy_members WHERE id = ${member.id} FOR UPDATE`)
    const held = await tx
      .select({ securityId: fantasyPositions.securityId, shares: fantasyPositions.shares, costBasis: fantasyPositions.costBasis, price: securities.closePrice })
      .from(fantasyPositions)
      .innerJoin(securities, eq(fantasyPositions.securityId, securities.id))
      .where(eq(fantasyPositions.memberId, member.id))

    const state: MemberState = {
      cash: n(locked?.cash),
      positions: held.map((h) => ({ securityId: h.securityId, shares: n(h.shares), costBasis: n(h.costBasis), price: n(h.price) })),
    }

    let outcome
    try {
      outcome = applyTrade(
        state,
        input.side === "buy"
          ? { side: "buy", securityId: priced.securityId, price: priced.price, amount: input.amount }
          : { side: "sell", securityId: priced.securityId, price: priced.price, shares: input.shares },
        { maxPositionPct: league.maxPositionPct },
      )
    } catch (error) {
      if (error instanceof TradeRejected) throw new ApiError(error.message, 422)
      throw error
    }

    await tx
      .update(fantasyMembers)
      .set({ cash: sql`${fantasyMembers.cash} + ${outcome.cashDelta.toFixed(6)}::numeric` })
      .where(eq(fantasyMembers.id, member.id))

    if (outcome.position) {
      await tx
        .insert(fantasyPositions)
        .values({ memberId: member.id, securityId: priced.securityId, shares: outcome.position.shares.toFixed(8), costBasis: outcome.position.costBasis.toFixed(6) })
        .onConflictDoUpdate({
          target: [fantasyPositions.memberId, fantasyPositions.securityId],
          set: { shares: outcome.position.shares.toFixed(8), costBasis: outcome.position.costBasis.toFixed(6), updatedAt: new Date() },
        })
    } else {
      await tx
        .delete(fantasyPositions)
        .where(and(eq(fantasyPositions.memberId, member.id), eq(fantasyPositions.securityId, priced.securityId)))
    }

    const [trade] = await tx
      .insert(fantasyTrades)
      .values({
        leagueId,
        memberId: member.id,
        securityId: priced.securityId,
        side: input.side,
        shares: outcome.shares.toFixed(8),
        price: priced.price.toString(),
        priceAsOf: priced.asOf,
      })
      .returning()

    return { trade: trade!, ticker: displaySymbol(marketTicker), price: priced.price, priceAsOf: priced.asOf, shares: outcome.shares }
  })
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
  if (!isClosed(league.endsAt)) await refreshStalePrices()

  const members = await db
    .select({ id: fantasyMembers.id, cash: fantasyMembers.cash, userId: users.id, name: users.name, handle: users.handle, image: users.image })
    .from(fantasyMembers)
    .innerJoin(users, eq(fantasyMembers.userId, users.id))
    .where(eq(fantasyMembers.leagueId, leagueId))
  const memberIds = members.map((m) => m.id)

  const [positions, snapshots, feed] = await Promise.all([
    loadPositions(memberIds),
    db
      .select({ memberId: fantasySnapshots.memberId, date: fantasySnapshots.date, value: fantasySnapshots.value })
      .from(fantasySnapshots)
      .where(inArray(fantasySnapshots.memberId, memberIds))
      .orderBy(asc(fantasySnapshots.date)),
    loadFeed(leagueId),
  ])

  const positionsBy = new Map<string, PositionRow[]>()
  for (const p of positions) positionsBy.set(p.memberId, [...(positionsBy.get(p.memberId) ?? []), p])
  const historyBy = new Map<string, { date: string; value: number }[]>()
  for (const s of snapshots) historyBy.set(s.memberId, [...(historyBy.get(s.memberId) ?? []), { date: s.date, value: n(s.value) }])

  const standings: FantasyStanding[] = rankReturns(members
    .map((m) => {
      const held = positionsBy.get(m.id) ?? []
      const cash = n(m.cash)
      const allHistory = historyBy.get(m.id) ?? []
      // A finished league is scored at its last nightly value, not today's prices.
      const frozen = isClosed(league.endsAt) ? allHistory.at(-1)?.value : undefined
      const value = frozen ?? portfolioValue({ cash, positions: held })
      const invested = value - cash
      const history = (historyBy.get(m.id) ?? []).filter((h) => h.date !== today())
      // Everyone starts at 100 on day one; the last point is live.
      const spark = [100, ...history.map((h) => 100 + returnPct(h.value, startingCash)), 100 + returnPct(value, startingCash)]
      return {
        userId: m.userId,
        name: m.name,
        handle: m.handle,
        image: m.image,
        rank: 0,
        percent: returnPct(value, startingCash),
        days: history.length + 1,
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
        reactions: {},
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
    value: p.shares * p.price,
    gainPct: p.costBasis > 0 ? ((p.shares * p.price) / p.costBasis - 1) * 100 : 0,
  }))

  const you = standings.find((s) => s.isYou)!

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
    you: { cash: you.cash, value: you.value, percent: you.percent, rank: you.rank, positions: mine.sort((a, b) => b.value - a.value) },
    feed,
  }
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
 * Nightly: one value per member of every open league, after repricing. A
 * finished league keeps the snapshots it had, which is what freezes it.
 */
export async function snapshotFantasy() {
  const open = await db
    .select({ memberId: fantasyMembers.id, endsAt: fantasyLeagues.endsAt })
    .from(fantasyMembers)
    .innerJoin(fantasyLeagues, eq(fantasyMembers.leagueId, fantasyLeagues.id))
  const ids = open.filter((m) => !isClosed(m.endsAt)).map((m) => m.memberId)
  const values = await memberValues(ids)
  const date = today()
  for (const [memberId, value] of values) {
    await db
      .insert(fantasySnapshots)
      .values({ memberId, date, value: value.toFixed(6) })
      .onConflictDoUpdate({ target: [fantasySnapshots.memberId, fantasySnapshots.date], set: { value: value.toFixed(6) } })
  }
  return { members: values.size }
}
