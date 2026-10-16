import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "../../db/schema.ts"
import { generateInviteCode } from "../crypto.ts"
import type { UsageStore } from "./credit-budget.ts"
import { DEFAULT_PUBLISH, detectMove, freshDrafts, marketsToLock, planPublication, planSchedule } from "./lines.ts"
import { acceptPick, DEFAULT_LIMITS, PickRejected, type PickRequest } from "./picks.ts"
import { mirroredPairs } from "./report.ts"
import { DEFAULT_RESOLVE, gradePick, planSettlement, placeKey, resolveResult, resultsForEvent, type ResolveConfig, type SettlementPlan } from "./settlement.ts"
import type { EventRef, MarketKind, OddsProvider, Outcome, ResultsProvider, Selection, Sport } from "./types.ts"
import { SPORTS } from "./types.ts"

/**
 * Database layer for sports leagues. Takes the drizzle client as a parameter so
 * the Next routes (server-only `@web/db`) and the plain-node seed script can
 * share it. All money movement is: one transaction, a row lock on the member,
 * a ledger row with a unique idempotency key, then the balance update.
 */

export type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type Conn = Db | Tx

export class SportsError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const { sportsLeagues, sportsMembers, sportsEvents, sportsMarkets, sportsLines, sportsPicks, sportsLedger, sportsProviderUsage, sportsNotifications } = schema

export const JOIN_FAILED = "That code didn't work"

/* ---------------- leagues ---------------- */

export async function createSportsLeague(
  db: Db,
  userId: string,
  input: { name: string; emoji: string; accent: string; sports: Sport[]; startingCredits: number; endsAt: Date | null },
) {
  return db.transaction(async (tx) => {
    const [league] = await tx
      .insert(sportsLeagues)
      .values({ ...input, ownerId: userId, inviteCode: generateInviteCode() })
      .returning()
    await addMember(tx, league!.id, userId, input.startingCredits)
    return league!
  })
}

async function addMember(tx: Conn, leagueId: string, userId: string, credits: number) {
  const [member] = await tx.insert(sportsMembers).values({ leagueId, userId, credits }).returning()
  await tx.insert(sportsLedger).values({ memberId: member!.id, type: "grant", amount: credits, idempotencyKey: `grant:${member!.id}` })
  return member!
}

export async function joinSportsLeague(db: Db, userId: string, code: string) {
  return db.transaction(async (tx) => {
    const [found] = await tx.select({ id: sportsLeagues.id }).from(sportsLeagues).where(eq(sportsLeagues.inviteCode, code.trim().toUpperCase())).limit(1)
    // One message for unknown, ended and full, so codes can't be probed for what exists.
    if (!found) throw new SportsError(JOIN_FAILED, 404)
    // The league row lock serialises joins, so the member limit cannot be raced past.
    const [league] = await tx.select().from(sportsLeagues).where(eq(sportsLeagues.id, found.id)).for("update")
    if (!league) throw new SportsError(JOIN_FAILED, 404)
    if (league.endsAt && league.endsAt.getTime() < Date.now()) throw new SportsError(JOIN_FAILED, 404)
    const members = await tx.select({ userId: sportsMembers.userId }).from(sportsMembers).where(eq(sportsMembers.leagueId, league.id))
    if (members.some((m) => m.userId === userId)) return league
    if (members.length >= league.memberLimit) throw new SportsError(JOIN_FAILED, 404)
    await addMember(tx, league.id, userId, league.startingCredits)
    return league
  })
}

export async function listSportsLeagues(db: Db, userId: string) {
  const rows = await db
    .select({ league: sportsLeagues, credits: sportsMembers.credits })
    .from(sportsMembers)
    .innerJoin(sportsLeagues, eq(sportsLeagues.id, sportsMembers.leagueId))
    .where(eq(sportsMembers.userId, userId))
    .orderBy(desc(sportsLeagues.createdAt))
  const counts = rows.length
    ? await db
        .select({ leagueId: sportsMembers.leagueId, n: sql<number>`count(*)::int` })
        .from(sportsMembers)
        .where(inArray(sportsMembers.leagueId, rows.map((r) => r.league.id)))
        .groupBy(sportsMembers.leagueId)
    : []
  const countOf = new Map(counts.map((c) => [c.leagueId, c.n]))
  return rows.map(({ league, credits }) => ({
    id: league.id,
    name: league.name,
    emoji: league.emoji,
    accent: league.accent,
    sports: league.sports,
    endsAt: league.endsAt?.toISOString() ?? null,
    isClosed: !!league.endsAt && league.endsAt.getTime() < Date.now(),
    memberCount: countOf.get(league.id) ?? 1,
    credits,
    startingCredits: league.startingCredits,
  }))
}

export async function getSportsLeagueDetail(db: Db, userId: string, leagueId: string, now: Date) {
  const [league] = await db.select().from(sportsLeagues).where(eq(sportsLeagues.id, leagueId)).limit(1)
  if (!league) throw new SportsError("League not found", 404)
  const members = await db
    .select({ id: sportsMembers.id, userId: sportsMembers.userId, credits: sportsMembers.credits, name: schema.users.name })
    .from(sportsMembers)
    .innerJoin(schema.users, eq(schema.users.id, sportsMembers.userId))
    .where(eq(sportsMembers.leagueId, leagueId))
  const me = members.find((m) => m.userId === userId)
  if (!me) throw new SportsError("League not found", 404)
  const nameOf = new Map(members.map((m) => [m.id, m.name ?? "Player"]))

  // Standings: spendable credits plus stake still at risk, so an open pick doesn't read as a loss.
  const atRisk = await db
    .select({ memberId: sportsPicks.memberId, stake: sql<number>`coalesce(sum(${sportsPicks.stake}), 0)::int` })
    .from(sportsPicks)
    .where(and(eq(sportsPicks.leagueId, leagueId), eq(sportsPicks.status, "open")))
    .groupBy(sportsPicks.memberId)
  const risk = new Map(atRisk.map((r) => [r.memberId, r.stake]))
  const standings = members
    .map((m) => ({ name: m.name ?? "Player", credits: m.credits + (risk.get(m.id) ?? 0), isYou: m.userId === userId }))
    .sort((a, b) => b.credits - a.credits)

  const open = await db
    .select({ market: sportsMarkets, event: sportsEvents })
    .from(sportsMarkets)
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(and(eq(sportsMarkets.status, "open"), gt(sportsMarkets.lockAt, now), inArray(sportsEvents.sport, league.sports)))
    .orderBy(asc(sportsEvents.startsAt), asc(sportsMarkets.marketKey))
    .limit(400)
  const lines = open.length ? await db.select().from(sportsLines).where(inArray(sportsLines.marketId, open.map((o) => o.market.id))) : []

  // "Picked" is looked up by market id, not taken from the history list, so a long history can't hide it.
  const pickedRows = open.length
    ? await db
        .select({ marketId: sportsPicks.marketId, selection: sportsPicks.selection, stake: sportsPicks.stake })
        .from(sportsPicks)
        .where(and(eq(sportsPicks.memberId, me.id), inArray(sportsPicks.marketId, open.map((o) => o.market.id))))
    : []
  const pickedBy = new Map(pickedRows.map((p) => [p.marketId, p]))

  const pickSelect = {
    id: sportsPicks.id,
    memberId: sportsPicks.memberId,
    selection: sportsPicks.selection,
    stake: sportsPicks.stake,
    price: sportsPicks.price,
    point: sportsPicks.point,
    totalReturn: sportsPicks.totalReturn,
    status: sportsPicks.status,
    acceptedAt: sportsPicks.acceptedAt,
    kind: sportsMarkets.kind,
    player: sportsMarkets.player,
    statKey: sportsMarkets.statKey,
    lockAt: sportsMarkets.lockAt,
    sport: sportsEvents.sport,
    home: sportsEvents.homeName,
    away: sportsEvents.awayName,
    startsAt: sportsEvents.startsAt,
  }
  const shapePick = (p: {
    id: string
    selection: string
    stake: number
    price: number
    point: number | null
    totalReturn: number
    status: string
    acceptedAt: Date
    kind: string
    player: string | null
    statKey: string | null
    sport: string
    home: string
    away: string
    startsAt: Date
  }) => ({
    id: p.id,
    selection: p.selection,
    stake: p.stake,
    price: p.price,
    point: p.point,
    totalReturn: p.totalReturn,
    // What actually comes back: the full return on a win, the stake on a push or void, nothing on a loss, unknown while open.
    payout: p.status === "won" ? p.totalReturn : p.status === "push" || p.status === "void" ? p.stake : p.status === "lost" ? 0 : null,
    status: p.status,
    acceptedAt: p.acceptedAt.toISOString(),
    market: { kind: p.kind, player: p.player, statKey: p.statKey },
    event: { sport: p.sport, home: p.home, away: p.away, startsAt: p.startsAt.toISOString() },
  })

  const mine = await db
    .select(pickSelect)
    .from(sportsPicks)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(eq(sportsPicks.memberId, me.id))
    .orderBy(desc(sportsPicks.acceptedAt))
    .limit(100)

  // Other members' picks are revealed only once the market has locked: never while anyone can still pick it.
  const others = await db
    .select(pickSelect)
    .from(sportsPicks)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(and(eq(sportsPicks.leagueId, leagueId), sql`${sportsPicks.memberId} <> ${me.id}`, sql`(${sportsMarkets.status} <> 'open' OR ${sportsMarkets.lockAt} <= ${now.toISOString()}::timestamptz)`))
    .orderBy(desc(sportsPicks.acceptedAt))
    .limit(60)

  return {
    league: {
      id: league.id,
      name: league.name,
      emoji: league.emoji,
      accent: league.accent,
      sports: league.sports,
      inviteCode: league.inviteCode,
      startingCredits: league.startingCredits,
      endsAt: league.endsAt?.toISOString() ?? null,
      isOwner: league.ownerId === userId,
    },
    you: { credits: me.credits },
    limits: {
      minStake: DEFAULT_LIMITS.minStake,
      maxStake: Math.floor((league.startingCredits * DEFAULT_LIMITS.maxStakePctOfStart) / 100),
      maxOpenPicks: DEFAULT_LIMITS.maxOpenPicks,
    },
    standings,
    markets: open.map(({ market, event }) => {
      const picked = pickedBy.get(market.id)
      return {
        id: market.id,
        kind: market.kind as MarketKind,
        player: market.player,
        statKey: market.statKey,
        lockAt: market.lockAt.toISOString(),
        event: { sport: event.sport, home: event.homeName, away: event.awayName, startsAt: event.startsAt.toISOString() },
        lines: lines
          .filter((l) => l.marketId === market.id)
          .map((l) => ({ id: l.id, selection: l.selection as Selection, price: l.price, point: l.point })),
        picked: picked ? { selection: picked.selection, stake: picked.stake } : null,
      }
    }),
    picks: mine.map(shapePick),
    leaguePicks: others.map((p) => ({ ...shapePick(p), name: nameOf.get(p.memberId) ?? "Player" })),
  }
}

/** Owner-only: pairs of members who keep taking opposite sides of the same locked market. */
export async function getMirroredPickReport(db: Db, userId: string, leagueId: string, now: Date) {
  const [league] = await db.select().from(sportsLeagues).where(eq(sportsLeagues.id, leagueId)).limit(1)
  if (!league || league.ownerId !== userId) throw new SportsError("League not found", 404)
  const rows = await db
    .select({ memberId: sportsPicks.memberId, marketId: sportsPicks.marketId, selection: sportsPicks.selection })
    .from(sportsPicks)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .where(and(eq(sportsPicks.leagueId, leagueId), sql`(${sportsMarkets.status} <> 'open' OR ${sportsMarkets.lockAt} <= ${now.toISOString()}::timestamptz)`))
  const members = await db
    .select({ id: sportsMembers.id, name: schema.users.name })
    .from(sportsMembers)
    .innerJoin(schema.users, eq(schema.users.id, sportsMembers.userId))
    .where(eq(sportsMembers.leagueId, leagueId))
  const nameOf = new Map(members.map((m) => [m.id, m.name ?? "Player"]))
  return mirroredPairs(rows).map((p) => ({ a: nameOf.get(p.a) ?? "Player", b: nameOf.get(p.b) ?? "Player", markets: p.markets }))
}

/* ---------------- picks ---------------- */

/**
 * Places a pick atomically. The member row is locked first, so two concurrent
 * picks serialise and each sees the balance the other left. The pick, its
 * ledger row and the balance change commit together or not at all. Replaying
 * the same `requestId` returns the original pick instead of placing a second.
 */
export async function placeSportsPick(db: Db, userId: string, leagueId: string, req: PickRequest & { requestId: string }, now: Date) {
  return db.transaction(async (tx) => {
    const [member] = await tx.execute<{ id: string; credits: number }>(
      sql`SELECT id, credits FROM sports_members WHERE league_id = ${leagueId} AND user_id = ${userId} FOR UPDATE`,
    )
    if (!member) throw new SportsError("League not found", 404)

    const [replay] = await tx
      .select()
      .from(sportsPicks)
      .where(and(eq(sportsPicks.memberId, member.id), eq(sportsPicks.requestId, req.requestId)))
      .limit(1)
    if (replay) return { pick: replay, replayed: true }

    const [league] = await tx.select().from(sportsLeagues).where(eq(sportsLeagues.id, leagueId)).limit(1)
    if (!league) throw new SportsError("League not found", 404)
    if (league.endsAt && league.endsAt.getTime() < now.getTime()) throw new SportsError("That league has ended")

    const [theLine] = await tx.select().from(sportsLines).where(eq(sportsLines.id, req.lineId)).limit(1)
    if (!theLine) throw new SportsError("Line not found", 404)
    // A shared row lock on the market: voidMarket / freezing take the same row exclusively, so a void either
    // waits for this pick to commit (and then refunds it) or runs first (and this pick sees `void` and is refused).
    const [theMarket] = await tx.select().from(sportsMarkets).where(eq(sportsMarkets.id, theLine.marketId)).for("share")
    const [theEvent] = theMarket ? await tx.select().from(sportsEvents).where(eq(sportsEvents.id, theMarket.eventId)).limit(1) : []
    if (!theMarket || !theEvent || !league.sports.includes(theEvent.sport)) throw new SportsError("Line not found", 404)
    const row = { line: theLine, market: theMarket, event: theEvent }

    const [existing] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sportsPicks)
      .where(and(eq(sportsPicks.memberId, member.id), eq(sportsPicks.marketId, row.market.id)))
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int`, stake: sql<number>`coalesce(sum(${sportsPicks.stake}), 0)::int` })
      .from(sportsPicks)
      .where(and(eq(sportsPicks.memberId, member.id), eq(sportsPicks.status, "open")))

    let accepted
    try {
      accepted = acceptPick(req, {
        now,
        market: { id: row.market.id, status: row.market.status, lockAt: row.market.lockAt },
        eventStatus: row.event.status,
        line: { id: row.line.id, marketId: row.line.marketId, price: row.line.price, point: row.line.point },
        member: { credits: member.credits },
        league: { startingCredits: league.startingCredits },
        picksOnMarket: existing?.n ?? 0,
        openPickCount: open?.n ?? 0,
        openStakeTotal: open?.stake ?? 0,
      })
    } catch (error) {
      if (error instanceof PickRejected) throw new SportsError(error.message, error.code === "insufficient_credits" ? 402 : 409)
      throw error
    }

    const [pick] = await tx
      .insert(sportsPicks)
      .values({
        leagueId,
        memberId: member.id,
        marketId: row.market.id,
        lineId: row.line.id,
        selection: row.line.selection,
        stake: accepted.stake,
        price: accepted.price,
        point: accepted.point,
        totalReturn: accepted.totalReturn,
        requestId: req.requestId,
        acceptedAt: accepted.acceptedAt,
      })
      .returning()
    await tx.insert(sportsLedger).values({
      memberId: member.id,
      pickId: pick!.id,
      type: "place",
      amount: -accepted.stake,
      idempotencyKey: placeKey(pick!.id),
    })
    await tx.update(sportsMembers).set({ credits: sql`${sportsMembers.credits} - ${accepted.stake}` }).where(eq(sportsMembers.id, member.id))
    return { pick: pick!, replayed: false }
  })
}

/* ---------------- line publishing ---------------- */

export class DbUsageStore implements UsageStore {
  private readonly db: Db
  constructor(db: Db) {
    this.db = db
  }
  async usage(provider: string, now: Date) {
    const day = now.toISOString().slice(0, 10)
    const month = day.slice(0, 7)
    const rows = await this.db.select().from(sportsProviderUsage).where(eq(sportsProviderUsage.provider, provider))
    return {
      month: rows.filter((r) => r.day.startsWith(month)).reduce((s, r) => s + r.credits, 0),
      day: rows.find((r) => r.day === day)?.credits ?? 0,
    }
  }
  async record(provider: string, credits: number, now: Date) {
    await this.db
      .insert(sportsProviderUsage)
      .values({ provider, day: now.toISOString().slice(0, 10), credits })
      .onConflictDoUpdate({ target: [sportsProviderUsage.provider, sportsProviderUsage.day], set: { credits: sql`${sportsProviderUsage.credits} + ${credits}` } })
  }
}

/** Fetches (via the provider, normally cached/composite), guards what is published, then publishes new fixed lines. Idempotent. */
export async function publishLines(db: Db, provider: OddsProvider, sports: readonly Sport[], now: Date, cfg = DEFAULT_PUBLISH) {
  const summary: { sport: Sport; published: number; frozen: number; rescheduled: number; rejected: string | null; notes: string[] }[] = []
  for (const sport of sports) {
    const snapshot = await provider.fetchOdds(sport, now)
    const guard = await guardPublished(db, snapshot, sport, now, cfg)
    const existing = await db
      .select({ ext: sportsEvents.externalId, key: sportsMarkets.marketKey })
      .from(sportsMarkets)
      .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
      .where(and(eq(sportsEvents.sport, sport), gt(sportsEvents.startsAt, now)))
    const plan = planPublication(snapshot, now, new Set(existing.map((e) => `${e.ext}::${e.key}`)), cfg)

    let published = 0
    for (const draft of plan.drafts) {
      const ev = snapshot.events.find((e) => e.externalId === draft.externalEventId)!
      await db.transaction(async (tx) => {
        const [event] = await tx
          .insert(sportsEvents)
          .values({ sport, externalId: ev.externalId, homeName: ev.homeName, awayName: ev.awayName, startsAt: ev.startsAt })
          .onConflictDoUpdate({ target: [sportsEvents.sport, sportsEvents.externalId], set: { externalId: ev.externalId } })
          .returning()
        const [market] = await tx
          .insert(sportsMarkets)
          .values({
            eventId: event!.id,
            marketKey: draft.marketKey,
            kind: draft.kind,
            player: draft.player,
            statKey: draft.statKey,
            lockAt: draft.lockAt,
            booksUsed: draft.booksUsed,
            fairProbA: draft.fairProbA,
            pointA: draft.lines[0].point,
          })
          .onConflictDoNothing()
          .returning()
        if (!market) return
        await tx.insert(sportsLines).values(draft.lines.map((l) => ({ marketId: market.id, selection: l.selection, price: l.price, point: l.point })))
        published++
      })
    }
    summary.push({ sport, published, frozen: guard.frozen, rescheduled: guard.rescheduled, rejected: plan.rejected, notes: snapshot.notes ?? [] })
  }
  return summary
}

/**
 * Keeps already-published lines honest against a fresh snapshot:
 *  - start times are synced; a start that moved earlier pulls the lock earlier (or freezes at once);
 *  - a market whose fresh consensus has drifted past the threshold is frozen: no new picks at the old
 *    price. Picks already accepted keep the line they were given.
 * Freezing takes the market row exclusively, so it is ordered against concurrent pick placement.
 */
export async function guardPublished(db: Db, snapshot: Awaited<ReturnType<OddsProvider["fetchOdds"]>>, sport: Sport, now: Date, cfg = DEFAULT_PUBLISH) {
  const out = { frozen: 0, rescheduled: 0 }
  const fresh = freshDrafts(snapshot, now, cfg)
  const open = await db
    .select({ market: sportsMarkets, event: sportsEvents })
    .from(sportsMarkets)
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(and(eq(sportsMarkets.status, "open"), eq(sportsEvents.sport, sport)))
  for (const { market, event } of open) {
    const theirs = snapshot.events.find((e) => e.externalId === event.externalId)
    if (!theirs) continue
    let freeze: string | null = null
    let lockAt = market.lockAt
    if (Math.abs(theirs.startsAt.getTime() - event.startsAt.getTime()) > 60_000) {
      const plan = planSchedule({ kind: market.kind as MarketKind, lockAt: market.lockAt }, theirs.startsAt, now, cfg)
      lockAt = plan.lockAt
      freeze = plan.freeze
      await db.update(sportsEvents).set({ startsAt: theirs.startsAt }).where(eq(sportsEvents.id, event.id))
      out.rescheduled++
    }
    const draft = fresh.get(`${event.externalId}::${market.marketKey}`)
    if (!freeze && draft) {
      freeze = detectMove({ kind: market.kind as MarketKind, lockAt, fairProbA: market.fairProbA, pointA: market.pointA }, draft, cfg)
    }
    await db.transaction(async (tx) => {
      // Exclusive lock on the market row: waits for in-flight picks, blocks new ones until commit.
      const [locked] = await tx.select().from(sportsMarkets).where(eq(sportsMarkets.id, market.id)).for("update")
      if (!locked || locked.status !== "open") return
      await tx
        .update(sportsMarkets)
        .set(freeze ? { status: "locked", frozenReason: freeze, lockAt } : { lockAt })
        .where(eq(sportsMarkets.id, market.id))
      if (freeze) out.frozen++
    })
  }
  return out
}

/** Closes markets whose lock time has passed. Picks are also refused by time in `acceptPick`, so this is bookkeeping, not the guard. */
export async function lockDueMarkets(db: Db, now: Date) {
  const open = await db.select().from(sportsMarkets).where(eq(sportsMarkets.status, "open"))
  const due = marketsToLock(open, now)
  if (due.length) await db.update(sportsMarkets).set({ status: "locked" }).where(inArray(sportsMarkets.id, due.map((m) => m.id)))
  return due.length
}

/* ---------------- settlement ---------------- */

/**
 * Applies a plan. A pick is only moved from `open`, and its ledger row is only
 * written (and credited) if that move actually happened, so concurrent or
 * repeated runs cannot pay twice. The ledger's unique key is the second guard.
 */
export async function applySettlement(tx: Tx, plan: SettlementPlan, now: Date) {
  const moved = new Set<string>()
  for (const s of plan.statuses) {
    const done = await tx
      .update(sportsPicks)
      .set({ status: s.status, settledAt: now })
      .where(and(eq(sportsPicks.id, s.pickId), eq(sportsPicks.status, "open")))
      .returning({ id: sportsPicks.id })
    if (done.length) moved.add(s.pickId)
  }
  if (moved.size) {
    const rows = await tx
      .select({ id: sportsPicks.id, status: sportsPicks.status, stake: sportsPicks.stake, totalReturn: sportsPicks.totalReturn, userId: sportsMembers.userId, leagueId: sportsPicks.leagueId })
      .from(sportsPicks)
      .innerJoin(sportsMembers, eq(sportsMembers.id, sportsPicks.memberId))
      .where(inArray(sportsPicks.id, [...moved]))
    if (rows.length) {
      await tx
        .insert(sportsNotifications)
        .values(
          rows.map((r) => ({
            userId: r.userId,
            kind: "pick_settled",
            pickId: r.id,
            payload: { status: r.status, stake: r.stake, payout: r.status === "won" ? r.totalReturn : r.status === "lost" ? 0 : r.stake, leagueId: r.leagueId },
          })),
        )
        .onConflictDoNothing()
    }
  }
  let credited = 0
  for (const entry of plan.ledger) {
    if (!moved.has(entry.pickId)) continue
    const inserted = await tx
      .insert(sportsLedger)
      .values({ memberId: entry.memberId, pickId: entry.pickId, type: entry.type, amount: entry.amount, idempotencyKey: entry.idempotencyKey })
      .onConflictDoNothing()
      .returning({ id: sportsLedger.id })
    if (!inserted.length) continue
    await tx.update(sportsMembers).set({ credits: sql`${sportsMembers.credits} + ${entry.amount}` }).where(eq(sportsMembers.id, entry.memberId))
    credited += entry.amount
  }
  return { settled: moved.size, credited }
}

async function settleMarketPicks(tx: Tx, marketId: string, outcomeOf: (p: typeof sportsPicks.$inferSelect) => Outcome, now: Date) {
  const picks = await tx.select().from(sportsPicks).where(and(eq(sportsPicks.marketId, marketId), eq(sportsPicks.status, "open")))
  const outcomes = new Map(picks.map((p) => [p.id, outcomeOf(p)]))
  const existing = picks.length
    ? await tx.select({ key: sportsLedger.idempotencyKey }).from(sportsLedger).where(inArray(sportsLedger.pickId, picks.map((p) => p.id)))
    : []
  const plan = planSettlement(
    picks.map((p) => ({ id: p.id, memberId: p.memberId, status: p.status as "open", stake: p.stake, totalReturn: p.totalReturn })),
    outcomes,
    new Set(existing.map((e) => e.key)),
  )
  return applySettlement(tx, plan, now)
}

/** Voids one market (injury or lineup news, bad line) and refunds every open pick on it. */
export async function voidMarket(db: Db, marketId: string, reason: string, now: Date) {
  return db.transaction(async (tx) => {
    await tx.update(sportsMarkets).set({ status: "void", voidReason: reason }).where(and(eq(sportsMarkets.id, marketId), inArray(sportsMarkets.status, ["open", "locked"])))
    return settleMarketPicks(tx, marketId, () => "void", now)
  })
}

/** Refunds picks still open on a void market (a void that raced a pick, or a crash mid-void). Safe to run any time. */
export async function sweepVoidedMarkets(db: Db, now: Date) {
  const stuck = await db
    .selectDistinct({ marketId: sportsPicks.marketId })
    .from(sportsPicks)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .where(and(eq(sportsPicks.status, "open"), eq(sportsMarkets.status, "void")))
  let refunded = 0
  for (const { marketId } of stuck) {
    refunded += (await db.transaction((tx) => settleMarketPicks(tx, marketId, () => "void", now))).settled
  }
  return refunded
}

/**
 * Settles every started event that still has unsettled markets. Results come
 * from the `results` providers (a different source than the odds), and an
 * event only settles when `resolveResult` says so.
 */
export async function settleDueEvents(db: Db, results: ResultsProvider[], now: Date, cfg: ResolveConfig = DEFAULT_RESOLVE) {
  const events = await db
    .selectDistinct({ event: sportsEvents })
    .from(sportsEvents)
    .innerJoin(sportsMarkets, eq(sportsMarkets.eventId, sportsEvents.id))
    .where(and(inArray(sportsMarkets.status, ["open", "locked"]), sql`${sportsEvents.startsAt} < ${now.toISOString()}::timestamptz`))
  const out = { settled: 0, voided: 0, waiting: 0, review: 0, swept: await sweepVoidedMarkets(db, now) }

  for (const sport of SPORTS) {
    const ofSport = events.map((e) => e.event).filter((e) => e.sport === sport)
    if (!ofSport.length) continue
    const refs: EventRef[] = ofSport.map((e) => ({ externalId: e.externalId, homeName: e.homeName, awayName: e.awayName, startsAt: e.startsAt }))
    const all = (await Promise.all(results.map((p) => p.fetchResults(sport, refs).catch(() => [])))).flat()

    for (const event of ofSport) {
      const { results: mine, matched } = resultsForEvent(event, all)
      const learned = Object.entries(matched).filter(([src, id]) => event.aliases?.[src] !== id)
      if (learned.length) {
        await db.update(sportsEvents).set({ aliases: { ...event.aliases, ...Object.fromEntries(learned) } }).where(eq(sportsEvents.id, event.id))
      }
      const sawFinal = mine.some((r) => r.status === "final")
      let firstSeen = event.finalFirstSeenAt
      if (sawFinal && !firstSeen) {
        firstSeen = now
        await db.update(sportsEvents).set({ finalFirstSeenAt: now }).where(eq(sportsEvents.id, event.id))
      }
      const res = resolveResult(mine, { now, startsAt: event.startsAt, finalFirstSeenAt: firstSeen }, cfg)
      if (res.kind === "wait") out.waiting++
      else if (res.kind === "review") out.review++
      else {
        const markets = await db.select().from(sportsMarkets).where(and(eq(sportsMarkets.eventId, event.id), inArray(sportsMarkets.status, ["open", "locked"])))
        await db.transaction(async (tx) => {
          for (const m of markets) {
            await settleMarketPicks(
              tx,
              m.id,
              (p) =>
                res.kind === "void"
                  ? "void"
                  : gradePick(
                      { sport: event.sport, kind: m.kind as MarketKind, selection: p.selection as Selection, point: p.point, player: m.player, statKey: m.statKey },
                      res.result,
                    ),
              now,
            )
            await tx
              .update(sportsMarkets)
              .set(res.kind === "void" ? { status: "void", voidReason: res.reason } : { status: "settled" })
              .where(eq(sportsMarkets.id, m.id))
          }
          await tx
            .update(sportsEvents)
            .set(
              res.kind === "void"
                ? { status: "void" }
                : { status: "final", homeScore: res.result.homeScore, awayScore: res.result.awayScore },
            )
            .where(eq(sportsEvents.id, event.id))
        })
        if (res.kind === "void") out.voided++
        else out.settled++
      }
    }
  }
  return out
}
