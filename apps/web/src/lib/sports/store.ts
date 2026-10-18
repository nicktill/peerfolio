import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "../../db/schema.ts"
import { generateInviteCode } from "../crypto.ts"
import { canSpend, type UsageStore } from "./credit-budget.ts"
import { DEFAULT_PUBLISH, detectMove, exchangeBucket, fetchBucket, fetchKind, freshDrafts, marketsToLock, missingReason, planPublication, planSchedule } from "./lines.ts"
import { bucketOf, LIMITS, PRUNE_AFTER_WINDOWS, withinLimit, type LimitName } from "./rate-limit.ts"
import { emit } from "./log.ts"
import { acceptPick, DEFAULT_LIMITS, kickoffGateDecided, PickRejected, type PickContext, type PickRequest } from "./picks.ts"
import { isLiveMarketKey } from "./live-pick.ts"
import { acceptParlay, decideParlay, decimalToAmerican, LEG_STATUS_OF, ParlayRejected, parlayPlaceKey, parlaySettleKey, PARLAY_LIMITS, type ParlayLegStatus, type ParlayRequest, type ParlayRow, type ParlayStatus } from "./parlay.ts"
import { mirroredPairs } from "./report.ts"
import { REPRICE } from "./reprice-config.ts"
import { type Decision, type RepriceResult, type RepriceTarget } from "./reprice.ts"
import { DEFAULT_RESOLVE, gradePick, needsMeteredSource, planSettlement, observeFinal, placeKey, resolveResult, resultsForEvent, type ResolveConfig, type ResolveConfigFor, type SettlementPlan } from "./settlement.ts"
import type { EventRef, EventResult, MarketKind, OddsProvider, Outcome, ResultsProvider, Selection, Sport } from "./types.ts"
import { hasDraw, SPORTS } from "./types.ts"

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

/** Postgres deadlock (40P01) or serialization failure (40001): safe to run the whole transaction again. */
const isRetryable = (error: unknown): boolean => {
  const e = error as { code?: string; cause?: { code?: string } } | null
  const code = e?.code ?? e?.cause?.code
  return code === "40P01" || code === "40001"
}

/**
 * Runs a transaction body, retrying a bounded number of times on deadlock. Lock order is
 * market -> member everywhere, so this should never fire; it is the belt to that braces.
 */
export async function withDeadlockRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i >= attempts || !isRetryable(error)) throw error
      await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 30))
    }
  }
}

/** Counts one attempt in the shared fixed window and says whether it is allowed. Works across servers. */
export async function takeRateLimit(db: Db, name: LimitName, userId: string, now: Date = new Date(), maxOverride?: number): Promise<boolean> {
  const { windowMs } = LIMITS[name]
  const max = maxOverride ?? LIMITS[name].max
  const [row] = await db
    .insert(sportsRateLimits)
    .values({ key: `${name}:${userId}`, bucket: bucketOf(now, windowMs), count: 1 })
    .onConflictDoUpdate({ target: [sportsRateLimits.key, sportsRateLimits.bucket], set: { count: sql`${sportsRateLimits.count} + 1` } })
    .returning({ count: sportsRateLimits.count })
  return withinLimit(row?.count ?? 1, max)
}

export async function pruneRateLimits(db: Db, now: Date = new Date()) {
  // The longest window decides how far back anything can still matter.
  const longest = Math.max(...Object.values(LIMITS).map((l) => l.windowMs))
  const cutoff = bucketOf(new Date(now.getTime() - PRUNE_AFTER_WINDOWS * longest), 1)
  // Buckets are window-sized units, so compare in each name's own unit by deleting by key prefix.
  for (const [name, { windowMs }] of Object.entries(LIMITS)) {
    await db.execute(sql`DELETE FROM sports_rate_limits WHERE key LIKE ${name + ":%"} AND bucket < ${bucketOf(new Date(now.getTime() - PRUNE_AFTER_WINDOWS * windowMs), windowMs)}`)
  }
  await db.execute(sql`DELETE FROM sports_rate_limits WHERE key LIKE ${"fetch:exchange:%"} AND bucket < ${exchangeBucket(now) - 48}`)
  await db.execute(sql`DELETE FROM sports_rate_limits WHERE key LIKE ${"exch-calls:%"} AND bucket < ${Math.floor(now.getTime() / 86_400_000) - PRUNE_AFTER_WINDOWS}`)
  for (const kind of ["guard", "discover"] as const) {
    await db.execute(sql`DELETE FROM sports_rate_limits WHERE key LIKE ${"fetch:" + kind + ":%"} AND bucket < ${fetchBucket(kind, now) - PRUNE_AFTER_WINDOWS}`)
  }
  return cutoff
}

const { sportsLeagues, sportsMembers, sportsEvents, sportsMarkets, sportsLines, sportsLineHistory, sportsPicks, sportsParlays, sportsParlayLegs, sportsLedger, sportsProviderUsage, sportsNotifications, sportsRateLimits } = schema

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

/** What an invite link may show before sign-in: the same name, mark and size the other invite pages show. Null when the code is unknown or the league ended. */
export async function previewSportsLeague(db: Db, code: string) {
  const [league] = await db.select().from(schema.sportsLeagues).where(eq(sportsLeagues.inviteCode, code.trim().toUpperCase())).limit(1)
  if (!league || (league.endsAt && league.endsAt.getTime() < Date.now())) return null
  const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(sportsMembers).where(eq(sportsMembers.leagueId, league.id))) as [{ count: number }]
  return { name: league.name, emoji: league.emoji, accent: league.accent, sports: league.sports, memberCount: count, startingCredits: league.startingCredits, full: count >= league.memberLimit }
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

  // The top of each league's standings (credits plus stake still riding, as on the league page) for a preview on the list.
  const leagueIds = rows.map((r) => r.league.id)
  const everyone = leagueIds.length
    ? await db
        .select({ id: sportsMembers.id, leagueId: sportsMembers.leagueId, userId: sportsMembers.userId, credits: sportsMembers.credits, name: schema.users.name, image: schema.users.image })
        .from(sportsMembers)
        .innerJoin(schema.users, eq(schema.users.id, sportsMembers.userId))
        .where(inArray(sportsMembers.leagueId, leagueIds))
    : []
  const riding = leagueIds.length
    ? await db
        .select({ memberId: sportsPicks.memberId, stake: sql<number>`coalesce(sum(${sportsPicks.stake}), 0)::int` })
        .from(sportsPicks)
        .where(and(inArray(sportsPicks.leagueId, leagueIds), eq(sportsPicks.status, "open")))
        .groupBy(sportsPicks.memberId)
    : []
  const ridingParlays = leagueIds.length
    ? await db
        .select({ memberId: sportsParlays.memberId, stake: sql<number>`coalesce(sum(${sportsParlays.stake}), 0)::int` })
        .from(sportsParlays)
        .where(and(inArray(sportsParlays.leagueId, leagueIds), eq(sportsParlays.status, "open")))
        .groupBy(sportsParlays.memberId)
    : []
  const riskOf = new Map<string, number>()
  for (const r of [...riding, ...ridingParlays]) riskOf.set(r.memberId, (riskOf.get(r.memberId) ?? 0) + r.stake)
  const leadersOf = (leagueId: string) =>
    everyone
      .filter((m) => m.leagueId === leagueId)
      .map((m) => ({ name: m.name ?? "Player", image: m.image, credits: m.credits + (riskOf.get(m.id) ?? 0), isYou: m.userId === userId }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 3)
  return rows.map(({ league, credits }) => ({
    leaders: leadersOf(league.id),
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
    .select({ id: sportsMembers.id, userId: sportsMembers.userId, credits: sportsMembers.credits, name: schema.users.name, image: schema.users.image })
    .from(sportsMembers)
    .innerJoin(schema.users, eq(schema.users.id, sportsMembers.userId))
    .where(eq(sportsMembers.leagueId, leagueId))
  const me = members.find((m) => m.userId === userId)
  if (!me) throw new SportsError("League not found", 404)
  const nameOf = new Map(members.map((m) => [m.id, m.name ?? "Player"]))
  const imageOf = new Map(members.map((m) => [m.id, m.image]))

  // Standings: spendable credits plus stake still at risk, so an open pick doesn't read as a loss.
  const atRisk = await db
    .select({ memberId: sportsPicks.memberId, stake: sql<number>`coalesce(sum(${sportsPicks.stake}), 0)::int` })
    .from(sportsPicks)
    .where(and(eq(sportsPicks.leagueId, leagueId), eq(sportsPicks.status, "open")))
    .groupBy(sportsPicks.memberId)
  const atRiskParlays = await db
    .select({ memberId: sportsParlays.memberId, stake: sql<number>`coalesce(sum(${sportsParlays.stake}), 0)::int` })
    .from(sportsParlays)
    .where(and(eq(sportsParlays.leagueId, leagueId), eq(sportsParlays.status, "open")))
    .groupBy(sportsParlays.memberId)
  const risk = new Map<string, number>()
  for (const r of [...atRisk, ...atRiskParlays]) risk.set(r.memberId, (risk.get(r.memberId) ?? 0) + r.stake)
  const records = await db.select({
    memberId: sportsPicks.memberId,
    won: sql<number>`count(*) filter (where ${sportsPicks.status} = 'won')::int`,
    lost: sql<number>`count(*) filter (where ${sportsPicks.status} = 'lost')::int`,
  }).from(sportsPicks).where(eq(sportsPicks.leagueId, leagueId)).groupBy(sportsPicks.memberId)
  const parlayRecords = await db.select({
    memberId: sportsParlays.memberId,
    won: sql<number>`count(*) filter (where ${sportsParlays.status} = 'won')::int`,
    lost: sql<number>`count(*) filter (where ${sportsParlays.status} = 'lost')::int`,
  }).from(sportsParlays).where(eq(sportsParlays.leagueId, leagueId)).groupBy(sportsParlays.memberId)
  // A settled parlay counts as one win or one loss.
  const recordOf = new Map<string, { won: number; lost: number }>()
  for (const r of [...records, ...parlayRecords]) {
    const cur = recordOf.get(r.memberId) ?? { won: 0, lost: 0 }
    recordOf.set(r.memberId, { won: cur.won + r.won, lost: cur.lost + r.lost })
  }
  const standings = members
    .map((m) => ({ name: m.name ?? "Player", image: m.image, record: recordOf.get(m.id) ?? { won: 0, lost: 0 }, credits: m.credits + (risk.get(m.id) ?? 0), isYou: m.userId === userId }))
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
    cashoutAmount: sportsPicks.cashoutAmount,
    acceptedAt: sportsPicks.acceptedAt,
    kind: sportsMarkets.kind,
    marketKey: sportsMarkets.marketKey,
    player: sportsMarkets.player,
    statKey: sportsMarkets.statKey,
    lockAt: sportsMarkets.lockAt,
    eventId: sportsEvents.id,
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
    cashoutAmount: number | null
    acceptedAt: Date
    kind: string
    marketKey: string
    player: string | null
    statKey: string | null
    eventId: string
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
    payout: p.status === "won" ? p.totalReturn : p.status === "push" || p.status === "void" ? p.stake : p.status === "lost" ? 0 : p.status === "cashed_out" ? (p.cashoutAmount ?? 0) : null,
    status: p.status,
    acceptedAt: p.acceptedAt.toISOString(),
    live: isLiveMarketKey(p.marketKey),
    market: { kind: p.kind, player: p.player, statKey: p.statKey },
    event: { id: p.eventId, sport: p.sport, home: p.home, away: p.away, startsAt: p.startsAt.toISOString() },
  })

  const mine = await db
    .select(pickSelect)
    .from(sportsPicks)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(eq(sportsPicks.memberId, me.id))
    .orderBy(desc(sportsPicks.acceptedAt))
    .limit(100)

  // Picks (the viewer's own included) are listed for the league only once the market has locked: never while anyone can still pick it.
  const others = await db
    .select(pickSelect)
    .from(sportsPicks)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(and(eq(sportsPicks.leagueId, leagueId), sql`(${sportsMarkets.status} <> 'open' OR ${sportsMarkets.lockAt} <= ${now.toISOString()}::timestamptz)`))
    .orderBy(desc(sportsPicks.acceptedAt))
    .limit(60)

  const myParlays = await loadParlayRows(db, eq(sportsParlays.memberId, me.id), 50)
  // Other members' parlays are listed only once every leg's market has locked.
  const leagueParlayRows = await loadParlayRows(db, eq(sportsParlays.leagueId, leagueId), 60, now)
  const liveEvents = await db.select({ id: sportsEvents.id, sport: sportsEvents.sport, home: sportsEvents.homeName, away: sportsEvents.awayName, startsAt: sportsEvents.startsAt })
    .from(sportsEvents).where(and(inArray(sportsEvents.sport, league.sports), gt(sportsEvents.startsAt, new Date(now.getTime() - 8 * 3600_000)), lt(sportsEvents.startsAt, now))).limit(300)
  return {
    liveEvents: liveEvents.map(e => ({ ...e, startsAt: e.startsAt.toISOString() })),
    league: {
      id: league.id,
      name: league.name,
      emoji: league.emoji,
      accent: league.accent,
      sports: league.sports,
      inviteCode: league.inviteCode,
      startingCredits: league.startingCredits,
      maxStakePct: league.maxStakePct,
      liveBetting: league.liveBetting,
      endsAt: league.endsAt?.toISOString() ?? null,
      isOwner: league.ownerId === userId,
    },
    you: { credits: me.credits },
    limits: {
      minStake: DEFAULT_LIMITS.minStake,
      maxStake: Math.floor((league.startingCredits * league.maxStakePct) / 100),
      maxOpenPicks: DEFAULT_LIMITS.maxOpenPicks,
      parlay: {
        minLegs: PARLAY_LIMITS.minLegs,
        maxLegs: PARLAY_LIMITS.maxLegs,
        minStake: PARLAY_LIMITS.minStake,
        maxStake: me.credits,
      },
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
        exchangeOkAt: market.exchangeOkAt?.toISOString() ?? null,
        event: { id: event.id, sport: event.sport, home: event.homeName, away: event.awayName, startsAt: event.startsAt.toISOString() },
        lines: lines
          .filter((l) => l.marketId === market.id)
          .map((l) => ({ id: l.id, selection: l.selection as Selection, price: l.price, point: l.point })),
        picked: picked ? { selection: picked.selection, stake: picked.stake } : null,
      }
    }),
    picks: mine.map(shapePick),
    parlays: myParlays.map((p) => p.row),
    leagueParlays: leagueParlayRows.map((p) => ({ ...p.row, name: nameOf.get(p.memberId) ?? "Player", image: imageOf.get(p.memberId) ?? null, you: p.memberId === me.id })),
    leaguePicks: others.map((p) => ({ ...shapePick(p), name: nameOf.get(p.memberId) ?? "Player", image: imageOf.get(p.memberId) ?? null, you: p.memberId === me.id })),
  }
}

/** Share of starting cash one pick may risk. Capped by the total-exposure limit so a single pick can never exceed it. */
export const MAX_STAKE_PCT_RANGE = { min: 1, max: 60 } as const

/** Owner-only: change the largest single pick. Applies to picks placed from now on; existing picks are untouched. */
export async function setLeagueMaxStakePct(db: Db, userId: string, leagueId: string, pct: number) {
  if (!Number.isInteger(pct) || pct < MAX_STAKE_PCT_RANGE.min || pct > MAX_STAKE_PCT_RANGE.max) {
    throw new SportsError(`Choose a whole number from ${MAX_STAKE_PCT_RANGE.min} to ${MAX_STAKE_PCT_RANGE.max}`, 400)
  }
  const [row] = await db.update(sportsLeagues).set({ maxStakePct: pct }).where(and(eq(sportsLeagues.id, leagueId), eq(sportsLeagues.ownerId, userId))).returning({ id: sportsLeagues.id })
  if (!row) throw new SportsError("Only the league owner can change this", 403)
  return { maxStakePct: pct }
}

/** Members only: pairs of members who keep taking opposite sides of the same locked market (locked picks are already public to the league). */
export async function getMirroredPickReport(db: Db, userId: string, leagueId: string, now: Date) {
  const [league] = await db.select().from(sportsLeagues).where(eq(sportsLeagues.id, leagueId)).limit(1)
  const [self] = league ? await db.select({ id: sportsMembers.id }).from(sportsMembers).where(and(eq(sportsMembers.leagueId, leagueId), eq(sportsMembers.userId, userId))).limit(1) : []
  if (!league || !self) throw new SportsError("League not found", 404)
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
/**
 * `now` is for tests and scripts that pin the clock. In production the route omits it and the time is read from the database
 * clock inside the transaction, AFTER the market and member locks are held and again on every deadlock retry, so a pick that
 * waited behind a lock (a reprice, a freeze, another pick) is judged against the kickoff gate at the instant it can actually
 * be accepted, not at the instant the request arrived. `acceptedAt` is that same instant.
 */
/** Open singles (live picks included) plus open parlays for one member: the count and stake every limit is checked against. Call with the member row locked. */
export async function openRisk(tx: Conn, memberId: string): Promise<{ count: number; stake: number }> {
  const [singles] = await tx
    .select({ n: sql<number>`count(*)::int`, stake: sql<number>`coalesce(sum(${sportsPicks.stake}), 0)::int` })
    .from(sportsPicks)
    .where(and(eq(sportsPicks.memberId, memberId), eq(sportsPicks.status, "open")))
  const [parlays] = await tx
    .select({ n: sql<number>`count(*)::int`, stake: sql<number>`coalesce(sum(${sportsParlays.stake}), 0)::int` })
    .from(sportsParlays)
    .where(and(eq(sportsParlays.memberId, memberId), eq(sportsParlays.status, "open")))
  return { count: (singles?.n ?? 0) + (parlays?.n ?? 0), stake: (singles?.stake ?? 0) + (parlays?.stake ?? 0) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A malformed id from a URL is "not found", not a database error. */
export function assertLeagueId(leagueId: string) {
  if (!UUID.test(leagueId)) throw new SportsError("League not found", 404)
}

export async function placeSportsPick(db: Db, userId: string, leagueId: string, req: PickRequest & { requestId: string }, now?: Date) {
  assertLeagueId(leagueId)
  const result = await withDeadlockRetry(() => placeOnce(db, userId, leagueId, req, now))
  // One summary per placement. Ids and money only: no names, no tokens.
  emit("info", result.replayed ? "sports.pick_replayed" : "sports.pick_placed", {
    pickId: result.pick.id,
    leagueId,
    marketId: result.pick.marketId,
    stake: result.pick.stake,
    price: result.pick.price,
    point: result.pick.point,
    totalReturn: result.pick.totalReturn,
    acceptedAt: result.pick.acceptedAt.toISOString(),
  })
  return result
}

async function placeOnce(db: Db, userId: string, leagueId: string, req: PickRequest & { requestId: string }, pinnedNow?: Date) {
  return db.transaction(async (tx) => {
    // LOCK ORDER, everywhere: market first, then member rows. voidMarket, freezing and settlement take the
    // market row exclusively before touching any member, so a pick can never hold a member and wait on a
    // market while a void holds the market and waits on that member.
    const [lineProbe] = await tx.select({ marketId: sportsLines.marketId }).from(sportsLines).where(eq(sportsLines.id, req.lineId)).limit(1)
    if (!lineProbe) throw new SportsError("Line not found", 404)
    // Shared: many picks proceed together; a void/freeze/reprice (exclusive) either waits for them or runs first and is seen here.
    const [theMarket] = await tx.select().from(sportsMarkets).where(eq(sportsMarkets.id, lineProbe.marketId)).for("share")
    if (!theMarket) throw new SportsError("Line not found", 404)
    // The line is read AFTER the market lock, never before: a reprice commits under the exclusive lock, so once we hold the
    // shared lock this row is the price offered right now, and the client's expected price is checked against exactly it.
    const [theLine] = await tx.select().from(sportsLines).where(eq(sportsLines.id, req.lineId)).limit(1)
    if (!theLine) throw new SportsError("Line not found", 404)

    const [member] = await tx.execute<{ id: string; credits: number }>(
      sql`SELECT id, credits FROM sports_members WHERE league_id = ${leagueId} AND user_id = ${userId} FOR UPDATE`,
    )
    if (!member) throw new SportsError("League not found", 404)

    // The clock is read only now, with every lock held (see placeSportsPick).
    const now = pinnedNow ?? new Date(String((await tx.execute<{ t: string }>(sql`SELECT clock_timestamp() AS t`))[0]!.t))

    const [replay] = await tx
      .select()
      .from(sportsPicks)
      .where(and(eq(sportsPicks.memberId, member.id), eq(sportsPicks.requestId, req.requestId)))
      .limit(1)
    if (replay) return { pick: replay, replayed: true }

    const [league] = await tx.select().from(sportsLeagues).where(eq(sportsLeagues.id, leagueId)).limit(1)
    if (!league) throw new SportsError("League not found", 404)
    if (league.endsAt && league.endsAt.getTime() < now.getTime()) throw new SportsError("That league has ended")

    const [theEvent] = await tx.select().from(sportsEvents).where(eq(sportsEvents.id, theMarket.eventId)).limit(1)
    if (!theEvent || !league.sports.includes(theEvent.sport)) throw new SportsError("Line not found", 404)
    const row = { line: theLine, market: theMarket, event: theEvent }

    const [existing] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sportsPicks)
      .where(and(eq(sportsPicks.memberId, member.id), eq(sportsPicks.marketId, row.market.id)))
    const risk = await openRisk(tx, member.id)
    // Betting the same line again adds to the open pick instead of creating a second one.
    const [sameLine] = existing?.n
      ? await tx.select().from(sportsPicks).where(and(eq(sportsPicks.memberId, member.id), eq(sportsPicks.marketId, row.market.id), eq(sportsPicks.lineId, row.line.id), eq(sportsPicks.status, "open"))).for("update")
      : []

    const pickCtx: PickContext = {
      now,
      market: { id: row.market.id, status: row.market.status, lockAt: row.market.lockAt },
      eventStatus: row.event.status,
      eventStartsAt: row.event.startsAt,
      line: { id: row.line.id, marketId: row.line.marketId, price: row.line.price, point: row.line.point },
      member: { credits: member.credits },
      league: { startingCredits: league.startingCredits },
      picksOnMarket: (existing?.n ?? 0) - (sameLine ? 1 : 0),
      openPickCount: risk.count - (sameLine ? 1 : 0),
      openStakeTotal: risk.stake,
    }
    let accepted
    try {
      accepted = acceptPick(req, pickCtx, { ...DEFAULT_LIMITS, maxStakePctOfStart: Infinity })
    } catch (error) {
      if (error instanceof PickRejected) {
        // Rejections caused only by the kickoff gate are warnings (they mean a lock was late or a start moved); the rest are routine.
        const kickoff = error.code === "market_closed" && kickoffGateDecided(pickCtx)
        emit(kickoff ? "warn" : "info", kickoff ? "sports.pick_rejected_kickoff" : "sports.pick_rejected", {
          code: error.code,
          leagueId,
          marketId: row.market.id,
          eventId: row.event.id,
          now: now.toISOString(),
          eventStartsAt: row.event.startsAt.toISOString(),
          lockAt: row.market.lockAt.toISOString(),
          marketStatus: row.market.status,
          eventStatus: row.event.status,
        })
        throw new SportsError(error.message, error.code === "insufficient_credits" ? 402 : 409)
      }
      throw error
    }

    if (sameLine) {
      // The ledger key carries the request id, so a retried add is recognised and never debits twice.
      const charged = await tx.insert(sportsLedger).values({ memberId: member.id, pickId: sameLine.id, type: "place", amount: -accepted.stake, idempotencyKey: `pick:${sameLine.id}:add:${req.requestId}` }).onConflictDoNothing().returning({ id: sportsLedger.id })
      if (charged.length === 0) return { pick: sameLine, replayed: true }
      const stake = sameLine.stake + accepted.stake
      const total = sameLine.totalReturn + accepted.totalReturn
      const [merged] = await tx.update(sportsPicks).set({ stake, totalReturn: total, price: decimalToAmerican(total / stake) }).where(eq(sportsPicks.id, sameLine.id)).returning()
      await tx.update(sportsMembers).set({ credits: sql`${sportsMembers.credits} - ${accepted.stake}` }).where(eq(sportsMembers.id, member.id))
      return { pick: merged!, replayed: false }
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

/* ---------------- parlays ---------------- */

/**
 * Parlays for the given filter, newest first, with their legs. With `lockedAt`, only parlays whose every leg's market is
 * already locked at that time (what the rest of the league may see).
 */
async function loadParlayRows(conn: Conn, where: SQL, limit: number, lockedAt?: Date): Promise<{ memberId: string; row: ParlayRow }[]> {
  const visible = lockedAt
    ? sql`not exists (select 1 from sports_parlay_legs l join sports_markets m on m.id = l.market_id where l.parlay_id = ${sportsParlays.id} and m.status = 'open' and m.lock_at > ${lockedAt.toISOString()}::timestamptz)`
    : undefined
  const parlays = await conn.select().from(sportsParlays).where(visible ? and(where, visible) : where).orderBy(desc(sportsParlays.acceptedAt)).limit(limit)
  if (!parlays.length) return []
  const legs = await conn
    .select({
      parlayId: sportsParlayLegs.parlayId,
      lineId: sportsParlayLegs.lineId,
      selection: sportsParlayLegs.selection,
      price: sportsParlayLegs.price,
      point: sportsParlayLegs.point,
      status: sportsParlayLegs.status,
      kind: sportsMarkets.kind,
      eventId: sportsEvents.id,
      sport: sportsEvents.sport,
      home: sportsEvents.homeName,
      away: sportsEvents.awayName,
      startsAt: sportsEvents.startsAt,
    })
    .from(sportsParlayLegs)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsParlayLegs.marketId))
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsParlayLegs.eventId))
    .where(inArray(sportsParlayLegs.parlayId, parlays.map((p) => p.id)))
    .orderBy(asc(sportsEvents.startsAt), asc(sportsParlayLegs.id))
  return parlays.map((p) => ({
    memberId: p.memberId,
    row: {
      id: p.id,
      stake: p.stake,
      price: decimalToAmerican(p.combinedDecimal),
      totalReturn: p.totalReturn,
      payout: p.status === "open" ? null : (p.payout ?? (p.status === "lost" ? 0 : p.stake)),
      status: p.status as ParlayStatus,
      acceptedAt: p.acceptedAt.toISOString(),
      legs: legs
        .filter((l) => l.parlayId === p.id)
        .map((l) => ({
          lineId: l.lineId,
          selection: l.selection,
          price: l.price,
          point: l.point,
          status: l.status as ParlayLegStatus,
          market: { kind: l.kind, player: null },
          event: { id: l.eventId, sport: l.sport, home: l.home, away: l.away, startsAt: l.startsAt.toISOString() },
        })),
    },
  }))
}

/**
 * Places a parlay atomically, the same way as a single pick: shared locks on every leg's market (in id order, the global
 * market-first lock order), then the member row; the clock is read with all locks held. Replaying the same `requestId`
 * returns the original parlay.
 */
export async function placeSportsParlay(db: Db, userId: string, leagueId: string, req: ParlayRequest & { requestId: string }, now?: Date) {
  assertLeagueId(leagueId)
  const result = await withDeadlockRetry(() => placeParlayOnce(db, userId, leagueId, req, now))
  emit("info", result.replayed ? "sports.parlay_replayed" : "sports.parlay_placed", {
    parlayId: result.parlay.id,
    leagueId,
    legs: result.parlay.legs.length,
    stake: result.parlay.stake,
    price: result.parlay.price,
    totalReturn: result.parlay.totalReturn,
  })
  return result
}

async function placeParlayOnce(db: Db, userId: string, leagueId: string, req: ParlayRequest & { requestId: string }, pinnedNow?: Date) {
  if (req.legs.length > PARLAY_LIMITS.maxLegs) throw new SportsError(`A parlay can have at most ${PARLAY_LIMITS.maxLegs} legs`, 400)
  if (new Set(req.legs.map((l) => l.lineId)).size !== req.legs.length) throw new SportsError("Each leg must be a different line", 400)
  return db.transaction(async (tx) => {
    const lineIds = req.legs.map((l) => l.lineId)
    const probes = await tx.select({ id: sportsLines.id, marketId: sportsLines.marketId }).from(sportsLines).where(inArray(sportsLines.id, lineIds))
    if (probes.length !== lineIds.length) throw new SportsError("A line in your parlay is no longer available", 404)
    const marketIds = [...new Set(probes.map((p) => p.marketId))].sort()
    const markets = await tx.select().from(sportsMarkets).where(inArray(sportsMarkets.id, marketIds)).orderBy(asc(sportsMarkets.id)).for("share")
    if (markets.length !== marketIds.length) throw new SportsError("A line in your parlay is no longer available", 404)
    // Live picks sit on synthetic locked markets; parlays are pregame-only.
    if (markets.some((m) => isLiveMarketKey(m.marketKey))) throw new SportsError("Live lines can't go in a parlay", 409)
    // Lines are read after the market locks: they are the prices on offer right now.
    const lines = await tx.select().from(sportsLines).where(inArray(sportsLines.id, lineIds))

    const [member] = await tx.execute<{ id: string; credits: number }>(
      sql`SELECT id, credits FROM sports_members WHERE league_id = ${leagueId} AND user_id = ${userId} FOR UPDATE`,
    )
    if (!member) throw new SportsError("League not found", 404)
    const now = pinnedNow ?? new Date(String((await tx.execute<{ t: string }>(sql`SELECT clock_timestamp() AS t`))[0]!.t))

    const [replay] = await tx.select({ id: sportsParlays.id }).from(sportsParlays).where(and(eq(sportsParlays.memberId, member.id), eq(sportsParlays.requestId, req.requestId))).limit(1)
    if (replay) {
      const [row] = await loadParlayRows(tx, eq(sportsParlays.id, replay.id), 1)
      return { parlay: row!.row, replayed: true }
    }

    const [league] = await tx.select().from(sportsLeagues).where(eq(sportsLeagues.id, leagueId)).limit(1)
    if (!league) throw new SportsError("League not found", 404)
    if (league.endsAt && league.endsAt.getTime() < now.getTime()) throw new SportsError("That league has ended")
    const events = await tx.select().from(sportsEvents).where(inArray(sportsEvents.id, markets.map((m) => m.eventId)))

    const legCtx = []
    for (const leg of req.legs) {
      const line = lines.find((l) => l.id === leg.lineId)
      const market = line && markets.find((m) => m.id === line.marketId)
      const event = market && events.find((e) => e.id === market.eventId)
      if (!line || !market || !event || !league.sports.includes(event.sport)) throw new SportsError("A line in your parlay is no longer available", 404)
      legCtx.push({
        market: { id: market.id, status: market.status, lockAt: market.lockAt, kind: market.kind, player: market.player },
        eventId: event.id,
        eventStatus: event.status,
        eventStartsAt: event.startsAt,
        line: { id: line.id, marketId: line.marketId, price: line.price, point: line.point },
      })
    }

    const risk = await openRisk(tx, member.id)

    let accepted
    try {
      accepted = acceptParlay(req, {
        now,
        legs: legCtx,
        member: { credits: member.credits },
        league: {
          startingCredits: league.startingCredits,
          maxReturnPctOfStart: DEFAULT_LIMITS.maxReturnPctOfStart,
          maxExposurePctOfStart: DEFAULT_LIMITS.maxExposurePctOfStart,
          maxOpenPicks: DEFAULT_LIMITS.maxOpenPicks,
        },
        openPickCount: risk.count,
        openStakeTotal: risk.stake,
      }, { ...PARLAY_LIMITS, maxStakePctOfStart: league.maxStakePct })
    } catch (error) {
      if (error instanceof ParlayRejected) {
        emit("info", "sports.parlay_rejected", { code: error.code, leagueId, now: now.toISOString() })
        throw new SportsError(error.message, error.code === "insufficient_credits" ? 402 : 409)
      }
      throw error
    }

    const [parlay] = await tx
      .insert(sportsParlays)
      .values({
        leagueId,
        memberId: member.id,
        stake: accepted.stake,
        combinedDecimal: accepted.combinedDecimal,
        totalReturn: accepted.totalReturn,
        requestId: req.requestId,
        acceptedAt: accepted.acceptedAt,
      })
      .returning()
    await tx.insert(sportsParlayLegs).values(
      legCtx.map((c) => ({
        parlayId: parlay!.id,
        lineId: c.line.id,
        marketId: c.market.id,
        eventId: c.eventId,
        selection: lines.find((l) => l.id === c.line.id)!.selection,
        price: c.line.price,
        point: c.line.point,
      })),
    )
    await tx.insert(sportsLedger).values({ memberId: member.id, type: "place", amount: -accepted.stake, idempotencyKey: parlayPlaceKey(parlay!.id) })
    await tx.update(sportsMembers).set({ credits: sql`${sportsMembers.credits} - ${accepted.stake}` }).where(eq(sportsMembers.id, member.id))
    const [row] = await loadParlayRows(tx, eq(sportsParlays.id, parlay!.id), 1)
    return { parlay: row!.row, replayed: false }
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

/** Row key of the live odds worker in `live_worker` (also exported from live/health.ts for the worker side). */
const LIVE_WORKER_NAME = "live-odds"

/** True while the live odds worker has beaten within REPRICE.workerDeadMs. No row at all counts as dead. */
export async function workerAlive(db: Db, now: Date): Promise<boolean> {
  const [w] = await db.select({ at: schema.liveWorker.lastCycleAt }).from(schema.liveWorker).where(eq(schema.liveWorker.name, LIVE_WORKER_NAME)).limit(1)
  return !!w && now.getTime() - w.at.getTime() < REPRICE.workerDeadMs
}

/**
 * Called by the publish cron on every run. If the worker that guards exchange-managed markets is not beating, such a
 * market that starts within REPRICE.windowMs is frozen (one-way) rather than left on a price nobody is watching; a market
 * further out simply stops being trusted (see makeFetchGate/guardPublished) and falls back to the consensus guard.
 */
export const WORKER_FREEZE_REASON = "live odds worker not running"
/** With no worker heartbeat nothing watches a published price between cron runs (30 min buckets, late runners), so markets close this long before kickoff. */
export const NO_WORKER_EARLY_LOCK_MS = 60 * 60_000

export async function freezeUnguardedMarkets(db: Db, now: Date): Promise<{ checked: number; frozen: number; reopened: number; workerAlive: boolean }> {
  const alive = await workerAlive(db, now)
  if (alive) {
    // Nothing reopens from the heartbeat alone: a market frozen for a dead worker sits on a price that may be hours old. The
    // repricer lists such markets (see listRepriceTargets) and reopens one only after a healthy exchange read (reopenWorkerFrozen).
    return { checked: 0, frozen: 0, reopened: 0, workerAlive: true }
  }
  const rows = await db
    .select({ id: sportsMarkets.id, lockAt: sportsMarkets.lockAt })
    .from(sportsMarkets)
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(
      and(
        eq(sportsMarkets.status, "open"),
        gt(sportsMarkets.lockAt, now),
        or(
          and(sql`${sportsMarkets.exchangeOkAt} IS NOT NULL`, sql`${sportsEvents.startsAt} <= ${new Date(now.getTime() + REPRICE.windowMs).toISOString()}::timestamptz`),
          sql`${sportsEvents.startsAt} <= ${new Date(now.getTime() + NO_WORKER_EARLY_LOCK_MS).toISOString()}::timestamptz`,
        ),
      ),
    )
  const out = { frozen: 0 }
  for (const r of rows) await freezeMarket(db, r.id, WORKER_FREEZE_REASON, r.lockAt, out)
  if (out.frozen) emit("error", "sports.markets_frozen_worker_dead", { frozen: out.frozen, checked: rows.length })
  return { checked: rows.length, frozen: out.frozen, reopened: 0, workerAlive: false }
}

/** An exchange confirmation this recent (and a live worker heartbeat, see workerAlive) means the exchange, not a paid Odds API fetch, is guarding the market. */
export const EXCHANGE_FRESH_MS = 5 * 60_000

/** Fetches (via the provider, normally cached/composite), guards what is published, then publishes new fixed lines. Idempotent. */
/**
 * Decides per sport whether this cron run may spend credits: an unlocked market wants a guard fetch (once per 2h), a game
 * starting within 24h wants a publish fetch (once per 12h), anything else costs nothing. Claims the bucket in the shared
 * rate-limit table, so every server and a late or doubled GitHub run agree on who fetches.
 */
export function makeFetchGate(db: Db, gameSoon: (sport: Sport, now: Date) => Promise<boolean | null>) {
  return async (sport: Sport, now: Date): Promise<boolean> => {
    const alive = await workerAlive(db, now)
    const [open] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sportsMarkets)
      .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
      .where(
        and(
          eq(sportsMarkets.status, "open"),
          gt(sportsMarkets.lockAt, now),
          eq(sportsEvents.sport, sport),
          // A market the exchange confirmed recently, with the worker alive, is guarded by the exchange, so it does not buy a paid guard fetch.
          alive ? or(isNull(sportsMarkets.exchangeOkAt), lt(sportsMarkets.exchangeOkAt, new Date(now.getTime() - EXCHANGE_FRESH_MS))) : undefined,
        ),
      )
    const kind = fetchKind({ hasUnlockedMarket: (open?.n ?? 0) > 0, gameWithin24h: (open?.n ?? 0) > 0 ? null : await gameSoon(sport, now) })
    if (!kind) return false
    const claim = async (k: "guard" | "discover") => {
      const [row] = await db
        .insert(sportsRateLimits)
        .values({ key: `fetch:${k}:${sport}`, bucket: fetchBucket(k, now), count: 1 })
        .onConflictDoUpdate({ target: [sportsRateLimits.key, sportsRateLimits.bucket], set: { count: sql`${sportsRateLimits.count} + 1` } })
        .returning({ count: sportsRateLimits.count })
      return (row?.count ?? 1) === 1
    }
    const first = await claim(kind)
    // A discovery fetch also serves as the guard fetch for this window: markets it publishes need no second fetch a cron tick later.
    if (first && kind === "discover") await claim("guard")
    return first
  }
}

/**
 * Exchange mode gate: free sources, so no credit buckets, just politeness. A sport is looked at at most once per 30 minutes (the
 * claim is shared by every server and any doubled run). Then it is fetched only if it has an unlocked market (to keep guarding it)
 * or the free schedule shows a game in the publish window. An unknown schedule (ESPN down) skips the sport this time.
 */
export function makeExchangeGate(db: Db, gameSoon: (sport: Sport, now: Date) => Promise<boolean | null>) {
  const gate = async (sport: Sport, now: Date): Promise<boolean> => {
    const [row] = await db
      .insert(sportsRateLimits)
      .values({ key: `fetch:exchange:${sport}`, bucket: exchangeBucket(now), count: 1 })
      .onConflictDoUpdate({ target: [sportsRateLimits.key, sportsRateLimits.bucket], set: { count: sql`${sportsRateLimits.count} + 1` } })
      .returning({ count: sportsRateLimits.count })
    if ((row?.count ?? 1) !== 1) return false
    const [open] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sportsMarkets)
      .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
      .where(and(eq(sportsMarkets.status, "open"), gt(sportsMarkets.lockAt, now), eq(sportsEvents.sport, sport)))
    if ((open?.n ?? 0) > 0) return true
    return (await gameSoon(sport, now)) === true
  }
  /** Gives the 30-minute claim back when the fetch did not run or failed, so the next cron tick retries instead of waiting out the bucket. */
  gate.release = async (sport: Sport, now: Date): Promise<void> => {
    await db.update(sportsRateLimits).set({ count: 0 }).where(and(eq(sportsRateLimits.key, `fetch:exchange:${sport}`), eq(sportsRateLimits.bucket, exchangeBucket(now))))
  }
  return gate
}

/** Shared per-sport, per-UTC-day request counter for the exchange provider (every upstream request takes one). */
export function makeDbCallCap(db: Db, perDay = 1000) {
  return {
    async take(sport: Sport, now: Date): Promise<boolean> {
      const [row] = await db
        .insert(sportsRateLimits)
        .values({ key: `exch-calls:${sport}`, bucket: Math.floor(now.getTime() / 86_400_000), count: 1 })
        .onConflictDoUpdate({ target: [sportsRateLimits.key, sportsRateLimits.bucket], set: { count: sql`${sportsRateLimits.count} + 1` } })
        .returning({ count: sportsRateLimits.count })
      return (row?.count ?? 1) <= perDay
    },
  }
}

export async function publishLines(db: Db, provider: OddsProvider, sports: readonly Sport[], now: Date, cfg = DEFAULT_PUBLISH, gate?: ((sport: Sport, now: Date) => Promise<boolean>) & { release?: (sport: Sport, now: Date) => Promise<void> }, deadlineAt?: number) {
  const summary: { sport: Sport; published: number; frozen: number; rescheduled: number; rejected: string | null; notes: string[] }[] = []
  for (const sport of sports) {
    // Out of time for this run (the route's deadline): skip, and do not burn the sport's claim.
    if (deadlineAt != null && Date.now() > deadlineAt) {
      summary.push({ sport, published: 0, frozen: 0, rescheduled: 0, rejected: "deadline", notes: ["no fetch: the run's time budget was used up, retried next run"] })
      continue
    }
    if (gate && !(await gate(sport, now))) {
      summary.push({ sport, published: 0, frozen: 0, rescheduled: 0, rejected: null, notes: ["no fetch: nothing unlocked and no game in the next 24h, or this window's fetch was already taken"] })
      continue
    }
    let snapshot: Awaited<ReturnType<OddsProvider["fetchOdds"]>>
    try {
      snapshot = await provider.fetchOdds(sport, now)
    } catch (error) {
      // One sport's outage must not stop the others, and must never freeze or publish anything for it.
      const capped = error instanceof Error && error.name === "ExchangeCapError"
      const message = error instanceof Error ? error.message : "error"
      await gate?.release?.(sport, now).catch(() => {})
      summary.push({ sport, published: 0, frozen: 0, rescheduled: 0, rejected: capped ? "call_cap" : "fetch_failed", notes: [capped ? `${provider.name}: skipped, call cap reached (${message})` : `${provider.name}: failed (${message})`] })
      continue
    }
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
          .values({ sport, externalId: ev.externalId, homeName: ev.homeName, awayName: ev.awayName, startsAt: ev.startsAt, aliases: ev.family ? { _family: ev.family } : {} })
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
        // Each line keeps the fair probability behind its price (the repricer's basis for a three-way market, and the move check's for any).
        await tx.insert(sportsLines).values(draft.lines.map((l, i) => ({ marketId: market.id, selection: l.selection, price: l.price, point: l.point, fairProb: draft.fairs[i] ?? null })))
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
  const guardedByWorker = await workerAlive(db, now)
  const open = await db
    .select({ market: sportsMarkets, event: sportsEvents })
    .from(sportsMarkets)
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(and(eq(sportsMarkets.status, "open"), eq(sportsEvents.sport, sport)))
  // Stored fair probability per line, in the market's line order, so a move on any side (the draw too) is seen.
  const storedFairs = new Map<string, (number | null)[]>()
  if (open.length) {
    const rows = await db.select().from(sportsLines).where(inArray(sportsLines.marketId, open.map((o) => o.market.id)))
    for (const { market } of open) storedFairs.set(market.id, sortLines(rows.filter((l) => l.marketId === market.id)).map((l) => l.fairProb))
  }
  const held = new Set(snapshot.held ?? [])
  for (const { market, event } of open) {
    // A gate hid this market this run (thin top of book, wide spread, Kalshi disagreement) but its game is still scheduled and not live:
    // hold it as it is, so a transient miss does not close it for good. The hold ends when nothing has vouched for the line for
    // staleFreezeMs: the exchange repricer freezes a market it manages, but one the exchange never confirmed (exchangeOkAt null)
    // has no such clock, so it is measured from its last exchange confirmation, or from publication if it never had one.
    if (held.has(`${event.externalId}::${market.marketKey}`)) {
      const lastVouched = (market.exchangeOkAt ?? market.createdAt).getTime()
      if (now.getTime() - lastVouched > REPRICE.staleFreezeMs) await freezeMarket(db, market.id, "price not confirmed while the guard feed was unavailable", market.lockAt, out)
      continue
    }
    const theirs = snapshot.events.find((e) => e.externalId === event.externalId)
    // Dropped from a trustworthy feed (event gone, prop pulled): close it. Freezing is one-way; a market that
    // comes back is not reopened, because picks taken in between were never checked against it. Existing picks settle normally.
    const gone = missingReason(snapshot, now, event.externalId, market.marketKey, cfg)
    if (!theirs && !gone) continue
    let freeze: string | null = gone
    let lockAt = market.lockAt
    if (!theirs) {
      await freezeMarket(db, market.id, freeze!, lockAt, out)
      continue
    }
    if (Math.abs(theirs.startsAt.getTime() - event.startsAt.getTime()) > 60_000) {
      const plan = planSchedule({ kind: market.kind as MarketKind, lockAt: market.lockAt }, theirs.startsAt, now, cfg)
      lockAt = plan.lockAt
      freeze = plan.freeze
      await db.update(sportsEvents).set({ startsAt: theirs.startsAt }).where(eq(sportsEvents.id, event.id))
      out.rescheduled++
    }
    const draft = fresh.get(`${event.externalId}::${market.marketKey}`)
    // An exchange-managed market is guarded by the exchange (repricing, jump and staleness freezes). The consensus drift
    // check applies only when the exchange has gone quiet, and then compares against the exchange-priced basis.
    const exchangeGuarded = guardedByWorker && market.exchangeOkAt != null && now.getTime() - market.exchangeOkAt.getTime() < EXCHANGE_FRESH_MS
    if (!freeze && draft && !exchangeGuarded) {
      freeze = detectMove({ kind: market.kind as MarketKind, lockAt, fairProbA: market.fairProbA, pointA: market.pointA, fairs: storedFairs.get(market.id) ?? null }, draft, cfg)
    }
    if (freeze || lockAt !== market.lockAt) await freezeMarket(db, market.id, freeze, lockAt, out)
  }
  return out
}

/** Exclusive lock on the market row: waits for in-flight picks, blocks new ones until commit. `reason` null only moves the lock. */
async function freezeMarket(db: Db, marketId: string, reason: string | null, lockAt: Date, out: { frozen: number }) {
  await withDeadlockRetry(() =>
    db.transaction(async (tx) => {
      const [locked] = await tx.select().from(sportsMarkets).where(eq(sportsMarkets.id, marketId)).for("update")
      if (!locked || locked.status !== "open") return
      await tx.update(sportsMarkets).set(reason ? { status: "locked", frozenReason: reason, lockAt } : { lockAt }).where(eq(sportsMarkets.id, marketId))
      if (reason) out.frozen++
    }),
  )
}

/* ---------------- pregame repricing (exchange mids) ---------------- */

/** Lines of one market in their fixed order: [home, draw, away], or the two sides with the first (home / over) first. */
const LINE_ORDER: Record<string, number> = { home: 0, over: 0, draw: 1, away: 2, under: 2 }
const sortLines = <T extends { selection: string }>(lines: T[]): T[] => [...lines].sort((x, y) => (LINE_ORDER[x.selection] ?? 9) - (LINE_ORDER[y.selection] ?? 9))

/** Open, unlocked, not-yet-started markets with their current prices and the last hour of fair-probability history. */
export async function listRepriceTargets(db: Db, now: Date, kinds: readonly string[] = ["moneyline"], horizonMs = 24 * 3600_000): Promise<RepriceTarget[]> {
  const rows = await db
    .select({ market: sportsMarkets, event: sportsEvents })
    .from(sportsMarkets)
    .innerJoin(sportsEvents, eq(sportsEvents.id, sportsMarkets.eventId))
    .where(
      and(
        // Open markets, plus those the cron froze for a dead worker: those reopen only on a healthy exchange read (see the pass).
        or(eq(sportsMarkets.status, "open"), and(eq(sportsMarkets.status, "locked"), eq(sportsMarkets.frozenReason, WORKER_FREEZE_REASON))),
        gt(sportsMarkets.lockAt, now),
        eq(sportsEvents.status, "scheduled"),
        gt(sportsEvents.startsAt, now),
        sql`${sportsEvents.startsAt} <= ${new Date(now.getTime() + horizonMs).toISOString()}::timestamptz`,
        inArray(sportsMarkets.kind, [...kinds]),
      ),
    )
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.market.id)
  const lines = await db.select().from(sportsLines).where(inArray(sportsLines.marketId, ids))
  const since = new Date(now.getTime() - REPRICE.hourMs)
  const history = await db
    .select({ marketId: sportsLineHistory.marketId, at: sportsLineHistory.at, fairProb: sportsLineHistory.fairProb, price: sportsLineHistory.price, lineId: sportsLineHistory.lineId })
    .from(sportsLineHistory)
    .where(and(inArray(sportsLineHistory.marketId, ids), gt(sportsLineHistory.at, since)))
    .orderBy(asc(sportsLineHistory.at))
  const out: RepriceTarget[] = []
  for (const { market, event } of rows) {
    const mine = sortLines(lines.filter((l) => l.marketId === market.id))
    const three = hasDraw(event.sport, market.kind)
    // A market must have exactly the lines its kind has: three for the soccer moneyline, two otherwise.
    if (mine.length !== (three ? 3 : 2)) continue
    if (three && !(mine[0]!.selection === "home" && mine[1]!.selection === "draw" && mine[2]!.selection === "away")) continue
    const a = mine[0]!
    const fairs = mine.map((l) => l.fairProb)
    const sideHistory = (l: (typeof mine)[number]) => history.filter((h) => h.lineId === l.id && h.fairProb != null)
    out.push({
      marketId: market.id,
      eventId: event.id,
      sport: event.sport,
      homeName: event.homeName,
      awayName: event.awayName,
      startsAt: event.startsAt,
      eventStatus: event.status,
      state: {
        kind: market.kind,
        status: market.status,
        lockAt: market.lockAt,
        createdAt: market.createdAt,
        fairProbA: market.fairProbA,
        pointA: market.pointA,
        prices: mine.map((l) => l.price),
        fairs: fairs.every((f): f is number => f != null) ? fairs : null,
        repricedAt: market.repricedAt,
        repriceCount: market.repriceCount,
        exchangeOkAt: market.exchangeOkAt,
        history: sideHistory(a).map((h) => ({
          at: h.at,
          fairProbA: h.fairProb!,
          // Three-way: the other sides' fair probabilities written at the same instant (one reprice writes every line with one timestamp).
          ...(three ? { fairs: mine.map((l) => sideHistory(l).find((x) => x.at.getTime() === h.at.getTime())?.fairProb ?? NaN) } : {}),
        })).filter((h) => !h.fairs || h.fairs.every((f) => Number.isFinite(f))),
      },
    })
  }
  return out
}

/**
 * Writes a new price version for a market, or refuses. Runs under the EXCLUSIVE market row lock, so it waits for picks being
 * accepted (they hold the shared lock) and any pick that starts afterwards sees the new price. Everything is re-checked
 * inside the lock on the server clock (open, not locked, not started, event still scheduled) and the write is a
 * compare-and-set on the basis the decision was made from, so a repeat or a second worker changes nothing. Lines are
 * updated in place and each price is appended to the history; accepted picks hold their own copies and are never touched.
 */
export function applyReprice(db: Db, marketId: string, expected: { basis: number | null; count: number }, d: Extract<Decision, { action: "update" }>, now: Date): Promise<RepriceResult> {
  // Master switch: the standalone worker may be pointed at a database before its markets are meant to be live.
  if (process.env.LIVE_ODDS_ENABLED !== "1") return Promise.resolve({ applied: false, reason: "disabled (LIVE_ODDS_ENABLED is not 1)" })
  return withDeadlockRetry(() =>
    db.transaction(async (tx): Promise<RepriceResult> => {
      const [m] = await tx.select().from(sportsMarkets).where(eq(sportsMarkets.id, marketId)).for("update")
      if (!m || m.status !== "open") return { applied: false, reason: "closed" }
      // Defense in depth: only game-winner markets are priced from the exchange, whatever the caller decided.
      if (m.kind !== "moneyline") return { applied: false, reason: "not a moneyline" }
      if (m.repricedAt && now.getTime() - m.repricedAt.getTime() < REPRICE.minIntervalMs) return { applied: false, reason: "min interval" }
      const [ev] = await tx.select().from(sportsEvents).where(eq(sportsEvents.id, m.eventId)).limit(1)
      if (!ev || ev.status !== "scheduled") return { applied: false, reason: "event not scheduled" }
      if (now.getTime() >= ev.startsAt.getTime()) return { applied: false, reason: "kickoff" }
      if (now.getTime() >= m.lockAt.getTime()) return { applied: false, reason: "locked" }
      // Compare-and-set on BOTH the basis and the version (write count): a repeat, or another worker, changes nothing.
      const same = (m.fairProbA == null && expected.basis == null) || (m.fairProbA != null && expected.basis != null && Math.abs(m.fairProbA - expected.basis) < 1e-9)
      if (!same || m.repriceCount !== expected.count) return { applied: false, reason: "basis changed" }
      const lines = sortLines(await tx.select().from(sportsLines).where(eq(sportsLines.marketId, marketId)))
      // The decision's sides must be exactly the market's lines: two, or [home, draw, away] for the soccer moneyline.
      const three = hasDraw(ev.sport, m.kind)
      if (lines.length !== d.prices.length || lines.length !== (three ? 3 : 2)) return { applied: false, reason: "lines missing" }
      if (three && !(lines[0]!.selection === "home" && lines[1]!.selection === "draw" && lines[2]!.selection === "away")) return { applied: false, reason: "lines missing" }
      const fairs = d.fairs ?? [d.fairProbA, 1 - d.fairProbA]
      if (fairs.length !== lines.length) return { applied: false, reason: "lines missing" }
      const a = lines[0]!
      const oldPrices = lines.map((l) => l.price)
      for (const [i, line] of lines.entries()) {
        const price = d.prices[i]!
        const fair = fairs[i]!
        await tx.update(sportsLines).set({ price, version: line.version + 1, fairProb: fair, repricedAt: now }).where(eq(sportsLines.id, line.id))
        await tx.insert(sportsLineHistory).values({ lineId: line.id, marketId: marketId, version: line.version + 1, price, point: line.point, fairProb: fair, source: d.source, spread: d.spread, ageMs: Math.round(d.ageMs), at: now })
      }
      await tx.update(sportsMarkets).set({ fairProbA: d.fairProbA, repricedAt: now, repriceCount: sql`${sportsMarkets.repriceCount} + 1`, exchangeOkAt: now }).where(eq(sportsMarkets.id, marketId))
      return { applied: true, oldPrices, newPrices: d.prices, version: a.version + 1 }
    }),
  )
}

/** Stamps healthy exchange checks on markets whose price did not need to move. Cheap, no market lock needed. */
export async function confirmExchange(db: Db, marketIds: string[], now: Date) {
  if (marketIds.length) await db.update(sportsMarkets).set({ exchangeOkAt: now }).where(and(inArray(sportsMarkets.id, marketIds), eq(sportsMarkets.status, "open")))
}

/**
 * Reopens a market the cron froze because the worker was down, called by the repricer only after a healthy exchange read for it.
 * Under the market lock; refuses unless it is still locked for exactly that reason, unstarted and before its lock time. Stamps
 * exchangeOkAt so the market counts as exchange-managed from now on. The caller then applies or confirms the fresh price.
 */
export async function reopenWorkerFrozen(db: Db, marketId: string, now: Date): Promise<boolean> {
  return withDeadlockRetry(() =>
    db.transaction(async (tx) => {
      const [m] = await tx.select().from(sportsMarkets).where(eq(sportsMarkets.id, marketId)).for("update")
      if (!m || m.status !== "locked" || m.frozenReason !== WORKER_FREEZE_REASON || now.getTime() >= m.lockAt.getTime()) return false
      const [ev] = await tx.select().from(sportsEvents).where(eq(sportsEvents.id, m.eventId)).limit(1)
      if (!ev || ev.status !== "scheduled" || now.getTime() >= ev.startsAt.getTime()) return false
      await tx.update(sportsMarkets).set({ status: "open", frozenReason: null, exchangeOkAt: now }).where(eq(sportsMarkets.id, marketId))
      emit("info", "sports.market_reopened_exchange_ok", { marketId })
      return true
    }),
  )
}

/** One-way close for a reason (jump, wide book, stale exchange). Takes the exclusive market lock like every freeze. */
export async function freezeForReason(db: Db, marketId: string, reason: string): Promise<boolean> {
  const out = { frozen: 0 }
  const [m] = await db.select({ lockAt: sportsMarkets.lockAt }).from(sportsMarkets).where(eq(sportsMarkets.id, marketId)).limit(1)
  if (!m) return false
  await freezeMarket(db, marketId, reason, m.lockAt, out)
  return out.frozen > 0
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
  for (const s of [...plan.statuses].sort((x, y) => x.pickId.localeCompare(y.pickId))) {
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
  // Same member order in every settlement run, so two runs touching the same members cannot deadlock.
  for (const entry of [...plan.ledger].sort((x, y) => x.memberId.localeCompare(y.memberId))) {
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

/**
 * Grades every open parlay leg on a market, then decides each affected parlay. Called with the market row already locked
 * exclusively. Parlay rows are locked next (id order), members last. A lost leg loses the parlay at once; push/void legs drop
 * out; the payout is credited once through a unique ledger key, and only by the run that moved the parlay out of `open`.
 */
async function settleMarketLegs(tx: Tx, marketId: string, outcomeOf: (p: { selection: string; point: number | null }) => Outcome, now: Date) {
  const legs = await tx.select().from(sportsParlayLegs).where(and(eq(sportsParlayLegs.marketId, marketId), eq(sportsParlayLegs.status, "open")))
  if (!legs.length) return
  const parlayIds = [...new Set(legs.map((l) => l.parlayId))].sort()
  await tx.select({ id: sportsParlays.id }).from(sportsParlays).where(inArray(sportsParlays.id, parlayIds)).orderBy(asc(sportsParlays.id)).for("update")
  for (const leg of legs) {
    await tx.update(sportsParlayLegs).set({ status: LEG_STATUS_OF[outcomeOf(leg)] }).where(and(eq(sportsParlayLegs.id, leg.id), eq(sportsParlayLegs.status, "open")))
  }
  const parlays = await tx.select().from(sportsParlays).where(and(inArray(sportsParlays.id, parlayIds), eq(sportsParlays.status, "open")))
  const allLegs = parlays.length ? await tx.select().from(sportsParlayLegs).where(inArray(sportsParlayLegs.parlayId, parlays.map((p) => p.id))) : []
  const decided = parlays
    .map((p) => ({ p, d: decideParlay(p.stake, allLegs.filter((l) => l.parlayId === p.id).map((l) => ({ status: l.status as ParlayLegStatus, price: l.price }))) }))
    .filter((x) => x.d.status !== "open")
    .sort((a, b) => a.p.memberId.localeCompare(b.p.memberId) || a.p.id.localeCompare(b.p.id))
  for (const { p, d } of decided) {
    const moved = await tx
      .update(sportsParlays)
      .set({ status: d.status, payout: d.payout ?? 0, settledAt: now })
      .where(and(eq(sportsParlays.id, p.id), eq(sportsParlays.status, "open")))
      .returning({ id: sportsParlays.id })
    if (!moved.length) continue
    if (d.status !== "lost" && d.payout! > 0) {
      const inserted = await tx
        .insert(sportsLedger)
        .values({ memberId: p.memberId, type: d.status === "won" ? "settle_win" : "settle_refund", amount: d.payout!, idempotencyKey: parlaySettleKey(p.id) })
        .onConflictDoNothing()
        .returning({ id: sportsLedger.id })
      if (inserted.length) await tx.update(sportsMembers).set({ credits: sql`${sportsMembers.credits} + ${d.payout!}` }).where(eq(sportsMembers.id, p.memberId))
    }
    const [owner] = await tx.select({ userId: sportsMembers.userId }).from(sportsMembers).where(eq(sportsMembers.id, p.memberId)).limit(1)
    if (owner) {
      await tx.insert(sportsNotifications).values({
        userId: owner.userId,
        kind: "parlay_settled",
        payload: { parlayId: p.id, status: d.status, stake: p.stake, payout: d.payout, leagueId: p.leagueId },
      })
    }
  }
}

async function settleMarketPicks(tx: Tx, marketId: string, outcomeOf: (p: { selection: string; point: number | null }) => Outcome, now: Date) {
  await settleMarketLegs(tx, marketId, outcomeOf, now)
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
export function voidMarket(db: Db, marketId: string, reason: string, now: Date) {
  return withDeadlockRetry(() =>
    db.transaction(async (tx) => {
      // Market first (exclusive), then members inside settleMarketPicks: the global lock order.
      await tx.select({ id: sportsMarkets.id }).from(sportsMarkets).where(eq(sportsMarkets.id, marketId)).for("update")
      await tx.update(sportsMarkets).set({ status: "void", voidReason: reason }).where(and(eq(sportsMarkets.id, marketId), inArray(sportsMarkets.status, ["open", "locked"])))
      return settleMarketPicks(tx, marketId, () => "void", now)
    }),
  )
}

/**
 * Tells each league owner with picks on this event that settlement needs a human, once per event and kind.
 * Recorded in the notifications outbox (and logged), so an admin screen or push job can surface it.
 */
export async function alertOwners(db: Db, eventId: string, kind: string, message: string) {
  const owners = await db
    .selectDistinct({ userId: sportsLeagues.ownerId, leagueId: sportsLeagues.id })
    .from(sportsPicks)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .innerJoin(sportsLeagues, eq(sportsLeagues.id, sportsPicks.leagueId))
    .where(eq(sportsMarkets.eventId, eventId))
  console.error(`[sports] ${kind} event=${eventId}: ${message}`)
  for (const o of owners) {
    const [already] = await db
      .select({ id: sportsNotifications.id })
      .from(sportsNotifications)
      .where(and(eq(sportsNotifications.userId, o.userId), eq(sportsNotifications.kind, kind), sql`${sportsNotifications.payload}->>'eventId' = ${eventId}`))
      .limit(1)
    if (!already) await db.insert(sportsNotifications).values({ userId: o.userId, kind, payload: { eventId, leagueId: o.leagueId, message } })
  }
}

/** Refunds picks still open on a void market (a void that raced a pick, or a crash mid-void). Safe to run any time. */
export async function sweepVoidedMarkets(db: Db, now: Date) {
  const stuck = await db
    .selectDistinct({ marketId: sportsPicks.marketId })
    .from(sportsPicks)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsPicks.marketId))
    .where(and(eq(sportsPicks.status, "open"), eq(sportsMarkets.status, "void")))
  const stuckLegs = await db
    .selectDistinct({ marketId: sportsParlayLegs.marketId })
    .from(sportsParlayLegs)
    .innerJoin(sportsMarkets, eq(sportsMarkets.id, sportsParlayLegs.marketId))
    .where(and(eq(sportsParlayLegs.status, "open"), eq(sportsMarkets.status, "void")))
  const stuckMarkets = [...new Map([...stuck, ...stuckLegs].map((s) => [s.marketId, s])).values()]
  let refunded = 0
  for (const { marketId } of stuckMarkets) {
    refunded += (
      await withDeadlockRetry(() =>
        db.transaction(async (tx) => {
          await tx.select({ id: sportsMarkets.id }).from(sportsMarkets).where(eq(sportsMarkets.id, marketId)).for("update")
          return settleMarketPicks(tx, marketId, () => "void", now)
        }),
      )
    ).settled
  }
  return refunded
}

const parseDate = (v: string | undefined): Date | null => {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/**
 * Settles every started event that still has unsettled markets. Results come
 * from the `results` providers (a different source than the odds), and an
 * event only settles when `resolveResult` says so.
 */
export async function settleDueEvents(
  db: Db,
  results: ResultsProvider[],
  now: Date,
  cfgIn: ResolveConfig | ResolveConfigFor = DEFAULT_RESOLVE,
  usage?: UsageStore,
  /** `eventId`: a targeted run for one event (an event-driven trigger). Same per-event logic and locks; no void sweep. */
  opts: { eventId?: string } = {},
) {
  const events = await db
    .selectDistinct({ event: sportsEvents })
    .from(sportsEvents)
    .innerJoin(sportsMarkets, eq(sportsMarkets.eventId, sportsEvents.id))
    .where(and(inArray(sportsMarkets.status, ["open", "locked"]), sql`${sportsEvents.startsAt} < ${now.toISOString()}::timestamptz`, ...(opts.eventId ? [eq(sportsEvents.id, opts.eventId)] : [])))
  const out = { settled: 0, voided: 0, waiting: 0, review: 0, failedSources: 0, swept: opts.eventId ? 0 : await sweepVoidedMarkets(db, now), meteredCalls: 0, meteredSkipped: 0 }
  const free = results.filter((p) => !p.metered)
  const metered = results.filter((p) => p.metered)

  // A failed fetch is an outage, not "no result": count only sources that answered.
  const ask = (p: ResultsProvider, sport: Sport, refs: EventRef[]) =>
    p.fetchResults(sport, refs).then(
      (r) => ({ ok: true as const, family: p.family ?? p.name, r }),
      (error: unknown) => {
        console.error(`[sports] results source ${p.name} failed:`, error instanceof Error ? error.message : error)
        return { ok: false as const, family: p.family ?? p.name, r: [] as EventResult[] }
      },
    )

  for (const sport of SPORTS) {
    const ofSport = events.map((e) => e.event).filter((e) => e.sport === sport)
    if (!ofSport.length) continue
    const cfg = typeof cfgIn === "function" ? cfgIn(sport) : cfgIn
    const toRef = (e: (typeof ofSport)[number]): EventRef => ({ externalId: e.externalId, homeName: e.homeName, awayName: e.awayName, startsAt: e.startsAt })
    const answers = await Promise.all(free.filter((p) => !p.sports || p.sports.includes(sport)).map((p) => ask(p, sport, ofSport.map(toRef))))

    // Metered sources (Odds API /scores) only for the events a free source has already finalised, and only inside their own credit pace.
    const freeAll = answers.flatMap((a) => a.r)
    const needing = ofSport.filter((e) => needsMeteredSource(e, resultsForEvent(e, freeAll).results, free.length > 0, now, cfg))
    if (needing.length) {
      for (const p of metered) {
        const m = p.metered!
        if (usage) {
          const cost = await m.estimate(sport).catch(() => 2)
          if (!canSpend(m.plan, await usage.usage(m.usageName, now), cost, now)) {
            out.meteredSkipped++
            continue
          }
        }
        const answer = await ask(p, sport, needing.map(toRef))
        out.meteredCalls++
        // Charged even when the call failed or came back empty: the provider bills the request.
        if (usage) await usage.record(m.usageName, m.lastCredits(), now)
        answers.push(answer)
      }
    }
    const all = answers.flatMap((a) => a.r)
    const sourcesAnswered = new Set(answers.filter((a) => a.ok).map((a) => a.family)).size
    out.failedSources += answers.filter((a) => !a.ok).length

    for (const event of ofSport) {
      const { results: mine, matched } = resultsForEvent(event, all)
      const learned = Object.entries(matched).filter(([src, id]) => event.aliases?.[src] !== id)
      const knownAliases: Record<string, string> = { ...event.aliases, ...Object.fromEntries(learned) }
      if (learned.length) {
        await db.update(sportsEvents).set({ aliases: knownAliases }).where(eq(sportsEvents.id, event.id))
      }
      // The score at the moment a final was first seen is kept (under a reserved alias key, no schema change) so a later change is caught.
      const seen = observeFinal(mine, { firstSeen: event.finalFirstSeenAt, firstSeenScore: knownAliases._finalScore ?? null, scoreSeenAt: parseDate(knownAliases._finalScoreAt), obs: Number(knownAliases._finalObs) || 0, lastObsAt: parseDate(knownAliases._finalObsAt) }, now)
      const { firstSeen, firstSeenScore, scoreSeenAt } = seen
      if (seen.changed) {
        const aliases = {
          ...knownAliases,
          ...(firstSeenScore ? { _finalScore: firstSeenScore } : {}),
          ...(scoreSeenAt ? { _finalScoreAt: scoreSeenAt.toISOString() } : {}),
          ...(seen.obs > 0 && seen.lastObsAt ? { _finalObs: String(seen.obs), _finalObsAt: seen.lastObsAt.toISOString() } : {}),
        }
        await db.update(sportsEvents).set({ finalFirstSeenAt: firstSeen, aliases }).where(eq(sportsEvents.id, event.id))
      }
      const res = resolveResult(mine, { now, startsAt: event.startsAt, finalFirstSeenAt: firstSeen, sourcesAnswered, sport, firstSeenScore, finalScoreSeenAt: scoreSeenAt, finalObservations: seen.obs }, cfg)
      if (res.kind === "wait") out.waiting++
      else if (res.kind === "review") {
        out.review++
        await alertOwners(db, event.id, "settlement_review", `Sources disagree about ${event.awayName} @ ${event.homeName} (${res.reason}). Picks stay open and refund automatically after the review timeout.`)
      }
      else {
        const markets = await db.select().from(sportsMarkets).where(and(eq(sportsMarkets.eventId, event.id), inArray(sportsMarkets.status, ["open", "locked"])))
        if (res.kind === "void" && /^(review|stuck) timeout/.test(res.reason)) {
          await alertOwners(db, event.id, "review_timeout", `${event.awayName} @ ${event.homeName} was voided and refunded: ${res.reason}.`)
        }
        await withDeadlockRetry(() => db.transaction(async (tx) => {
          // Market rows exclusively first, in id order, then members: the global lock order.
          for (const m of [...markets].sort((x, y) => x.id.localeCompare(y.id))) {
            await tx.select({ id: sportsMarkets.id }).from(sportsMarkets).where(eq(sportsMarkets.id, m.id)).for("update")
          }
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
        }))
        if (res.kind === "void") out.voided++
        else out.settled++
      }
    }
  }
  return out
}
