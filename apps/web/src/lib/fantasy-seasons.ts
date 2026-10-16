import "server-only"
import { randomBytes } from "node:crypto"
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm"
import {
  db,
  fantasyDraftPicks,
  fantasyEvents,
  fantasyLeagues,
  fantasyMembers,
  fantasyRecaps,
  fantasyRoundResults,
  fantasyRounds,
  fantasySeasons,
  fantasySnapshots,
  fantasyTrades,
  fantasyTrophies,
  securities,
  users,
} from "@web/db"
import { ApiError } from "@web/lib/api"
import { isClosed, scoredValue } from "@web/lib/fantasy-rules"
import {
  buildRecap,
  dateKey,
  DEFAULT_PICKS,
  draftScore,
  hasFinalSnapshot,
  MAX_PICKS,
  MIN_PICKS,
  nextSeasonStart,
  percentChange,
  rankRound,
  roundEndValue,
  roundNumberAt,
  roundStartValue,
  roundTrophies,
  roundWindow,
  seasonStandings,
  seasonTrophies,
  settleDecision,
  weekStart,
  type Decision,
  type Person,
  type RoundResult,
  type SeasonMode,
} from "@web/lib/fantasy-season"
import { refreshStalePrices } from "@web/lib/positions"

/**
 * The engine behind seasons and rounds. Everything here is idempotent and safe
 * to call from any number of requests at once: `advanceLeague` takes a
 * per-league advisory lock, and every write is either a claim (an update that
 * only one caller can win) or an insert that ignores duplicates. Nothing waits
 * for a cron to fire at a particular minute; the nightly job is a backstop.
 */

const n = (v: string | null | undefined) => (v == null ? 0 : Number(v))
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Season = typeof fantasySeasons.$inferSelect
type Round = typeof fantasyRounds.$inferSelect
type League = typeof fantasyLeagues.$inferSelect

/** Most rounds one call will create or settle, so a season left alone for a year can't hold a request. */
const MAX_ROUNDS_PER_CALL = 60

export type SeasonConfig = { mode: SeasonMode; roundCount: number | null; picksPerRound: number | null }

export const normalizeSeasonConfig = (input: { mode?: string; rounds?: number | null; picks?: number | null }): SeasonConfig => {
  const mode: SeasonMode = input.mode === "draft" ? "draft" : "trading"
  const roundCount = input.rounds == null ? null : Math.min(52, Math.max(1, Math.floor(input.rounds)))
  const picksPerRound = mode === "draft" ? Math.min(MAX_PICKS, Math.max(MIN_PICKS, Math.floor(input.picks ?? DEFAULT_PICKS))) : null
  return { mode, roundCount, picksPerRound }
}

/* ------------------------------------------------------------------ *
 * Creating seasons
 * ------------------------------------------------------------------ */

/**
 * Makes season 1 for a league that has none: open-ended and trading, starting
 * this week, so every league that existed before seasons keeps working and
 * simply starts having weekly rounds. Safe to call repeatedly.
 */
export async function ensureSeason(leagueId: string, config?: SeasonConfig, now = new Date()): Promise<Season> {
  const existing = await latestSeason(leagueId)
  if (existing) return existing
  const cfg = config ?? { mode: "trading" as const, roundCount: null, picksPerRound: null }
  const startsAt = cfg.mode === "draft" ? nextSeasonStart(now, "draft") : weekStart(now)
  await db.insert(fantasySeasons).values({ leagueId, number: 1, ...cfg, startsAt }).onConflictDoNothing()
  return (await latestSeason(leagueId))!
}

export async function latestSeason(leagueId: string): Promise<Season | undefined> {
  const [season] = await db.select().from(fantasySeasons).where(eq(fantasySeasons.leagueId, leagueId)).orderBy(sql`${fantasySeasons.number} DESC`).limit(1)
  return season
}

/** Starts the next season (the rematch). Owner only, and only once the last one is over. */
export async function startNextSeason(userId: string, leagueId: string, input: { mode?: string; rounds?: number | null; picks?: number | null }, now = new Date()) {
  const league = await db.query.fantasyLeagues.findFirst({ where: eq(fantasyLeagues.id, leagueId) })
  if (!league) throw new ApiError("League not found", 404)
  if (league.ownerId !== userId) throw new ApiError("Only the league owner can start a new season", 403)
  if (isClosed(league.endsAt, now)) throw new ApiError("This league has finished, so it can't start another season", 409)
  await advanceLeague(leagueId, now)
  const last = await latestSeason(leagueId)
  if (last && last.status !== "complete") throw new ApiError("The current season is still running. Wrap it up first.", 409)

  const cfg = normalizeSeasonConfig(input)
  const startsAt = nextSeasonStart(now, cfg.mode)
  const inserted = await db
    .insert(fantasySeasons)
    .values({ leagueId, number: (last?.number ?? 0) + 1, ...cfg, startsAt })
    .onConflictDoNothing()
    .returning()
  // Two quick taps: the second finds the season the first made.
  const season = inserted[0] ?? (await latestSeason(leagueId))!
  await emit(db, { leagueId, kind: "season_started", dedupeKey: `season_started:${season.id}`, payload: { seasonNumber: season.number, mode: season.mode, startsAt: season.startsAt.toISOString() } })
  return season
}

/** Ends an open-ended season after the round now in progress, or shortens a fixed one to it. */
export async function wrapUpSeason(userId: string, leagueId: string, now = new Date()) {
  const league = await db.query.fantasyLeagues.findFirst({ where: eq(fantasyLeagues.id, leagueId) })
  if (!league) throw new ApiError("League not found", 404)
  if (league.ownerId !== userId) throw new ApiError("Only the league owner can end a season", 403)
  await advanceLeague(leagueId, now)
  const season = await latestSeason(leagueId)
  if (!season || season.status === "complete") throw new ApiError("There's no season running", 409)
  const current = roundNumberAt(season.startsAt, now, null)
  if (current < 1) {
    // Has not started: nothing to score, so close it out empty.
    await db.update(fantasySeasons).set({ status: "complete", completedAt: now }).where(and(eq(fantasySeasons.id, season.id), eq(fantasySeasons.status, "active")))
    return { roundCount: 0 }
  }
  const roundCount = season.roundCount === null ? current : Math.min(season.roundCount, current)
  await db.update(fantasySeasons).set({ roundCount }).where(eq(fantasySeasons.id, season.id))
  await advanceLeague(leagueId, now)
  return { roundCount }
}

/* ------------------------------------------------------------------ *
 * Events (notification-ready)
 * ------------------------------------------------------------------ */

type Writer = Pick<typeof db, "insert">

async function emit(w: Writer, e: { leagueId: string; userId?: string | null; kind: string; payload: Record<string, unknown>; dedupeKey: string }) {
  await w
    .insert(fantasyEvents)
    .values({ leagueId: e.leagueId, userId: e.userId ?? null, kind: e.kind, payload: e.payload, dedupeKey: e.dedupeKey })
    .onConflictDoNothing()
}

/* ------------------------------------------------------------------ *
 * Advancing a league
 * ------------------------------------------------------------------ */

/**
 * Brings a league's seasons up to date: creates the rounds that now exist,
 * freezes draft picks whose deadline has passed, keeps the draft price marks
 * current, settles rounds that have ended (results, trophies, recap, events)
 * and completes the season when its last round is in.
 */
export async function advanceLeague(leagueId: string, now = new Date()): Promise<void> {
  const league = await db.query.fantasyLeagues.findFirst({ where: eq(fantasyLeagues.id, leagueId) })
  if (!league) return
  const season = await ensureSeason(leagueId, undefined, now)
  if (season.status === "complete") return

  // Fresh closes before they are used as marks. Throttled inside, and a failure must not block the page.
  if (season.mode === "draft") await refreshStalePrices().catch(() => {})

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${leagueId}, 0))`)
    // Re-read under the lock: another request may just have finished what this one came to do.
    const [current] = await tx.select().from(fantasySeasons).where(eq(fantasySeasons.id, season.id))
    if (!current || current.status === "complete") return
    await advanceSeason(tx, league, current, now)
  })
}

const effectiveEnd = (league: League, round: Round) => (league.endsAt && league.endsAt.getTime() < round.endsAt.getTime() ? league.endsAt : round.endsAt)

async function advanceSeason(tx: Tx, league: League, season: Season, now: Date) {
  const closed = isClosed(league.endsAt, now)
  const clock = closed && league.endsAt ? league.endsAt : now

  // 1. The rounds that exist by now (and, for a draft, the next one, open for picks).
  const inProgress = roundNumberAt(season.startsAt, clock, season.roundCount)
  const numbers: number[] = []
  for (let k = 1; k <= Math.min(inProgress, MAX_ROUNDS_PER_CALL); k++) numbers.push(k)
  if (season.mode === "draft" && !closed) {
    const next = inProgress + 1
    if (season.roundCount === null || next <= season.roundCount) numbers.push(next)
  }
  if (numbers.length > 0) {
    const created = await tx
      .insert(fantasyRounds)
      .values(numbers.map((number) => ({ seasonId: season.id, leagueId: league.id, number, ...roundWindow(season.startsAt, number) })))
      .onConflictDoNothing()
      .returning()
    for (const round of created) {
      if (season.mode === "draft" && round.startsAt.getTime() > now.getTime()) {
        await emit(tx, { leagueId: league.id, kind: "draft_open", dedupeKey: `draft_open:${round.id}`, payload: { roundNumber: round.number, seasonNumber: season.number, deadline: round.startsAt.toISOString() } })
      }
    }
  }

  const rounds = await tx.select().from(fantasyRounds).where(eq(fantasyRounds.seasonId, season.id)).orderBy(asc(fantasyRounds.number))

  // 2. Draft marks and locks. Entry prices follow the close until the deadline, exit prices
  // until the round ends; after that they stand. So a request that arrives late still scores
  // everyone on the closes of the right day.
  if (season.mode === "draft") {
    await tx.execute(sql`
      UPDATE fantasy_draft_picks p SET entry_price = s.close_price, entry_as_of = s.close_price_as_of
      FROM securities s, fantasy_rounds r
      WHERE p.security_id = s.id AND p.round_id = r.id AND r.season_id = ${season.id}
        AND r.status = 'open' AND r.starts_at > ${now.toISOString()}::timestamptz AND s.close_price IS NOT NULL AND s.close_price_final`)
    for (const round of rounds.filter((r) => r.status === "open" && r.startsAt.getTime() <= now.getTime())) {
      const [claimed] = await tx.update(fantasyRounds).set({ status: "locked" }).where(and(eq(fantasyRounds.id, round.id), eq(fantasyRounds.status, "open"))).returning({ id: fantasyRounds.id })
      if (!claimed) continue
      // A pick that never got a mark (no final close on file) takes the latest price now.
      await tx.execute(sql`
        UPDATE fantasy_draft_picks p SET entry_price = s.close_price, entry_as_of = s.close_price_as_of
        FROM securities s WHERE p.security_id = s.id AND p.round_id = ${round.id} AND p.entry_price IS NULL AND s.close_price IS NOT NULL`)
      round.status = "locked"
    }
    await tx.execute(sql`
      UPDATE fantasy_draft_picks p SET exit_price = s.close_price, exit_as_of = s.close_price_as_of
      FROM securities s, fantasy_rounds r
      WHERE p.security_id = s.id AND p.round_id = r.id AND r.season_id = ${season.id}
        AND r.status = 'locked' AND r.ends_at > ${now.toISOString()}::timestamptz AND s.close_price IS NOT NULL AND s.close_price_final`)
  }

  // 3. Settle rounds in order, as far as their data allows.
  const due = rounds.filter((r) => r.status !== "settled" && effectiveEnd(league, r).getTime() <= now.getTime())
  if (due.length > 0) {
    const people = await loadMembers(tx, league.id)
    for (const round of due.slice(0, MAX_ROUNDS_PER_CALL)) {
      const decision = await settleRound(tx, league, season, round, people, now)
      if (decision === "wait") break
    }
  }

  // 4. Complete the season when its last round is in.
  const settled = await tx.select({ n: sql<number>`count(*)::int` }).from(fantasyRounds).where(and(eq(fantasyRounds.seasonId, season.id), eq(fantasyRounds.status, "settled")))
  const lastNeeded = closed ? roundNumberAt(season.startsAt, clock, season.roundCount) : season.roundCount
  if (lastNeeded !== null && (settled[0]?.n ?? 0) >= lastNeeded) await completeSeason(tx, league, season)
}

type MemberRow = { id: string; userId: string; joinedAt: Date; cash: number; name: string | null; handle: string | null }

async function loadMembers(tx: Tx, leagueId: string): Promise<MemberRow[]> {
  const rows = await tx
    .select({ id: fantasyMembers.id, userId: fantasyMembers.userId, joinedAt: fantasyMembers.joinedAt, cash: fantasyMembers.cash, name: users.name, handle: users.handle })
    .from(fantasyMembers)
    .innerJoin(users, eq(fantasyMembers.userId, users.id))
    .where(eq(fantasyMembers.leagueId, leagueId))
  return rows.map((r) => ({ ...r, cash: n(r.cash) }))
}

const personOf = (m: MemberRow): Person => ({ userId: m.userId, name: m.name?.split(" ")[0] ?? m.handle ?? "Player", handle: m.handle })

type Scored = { memberId: string; userId: string; percent: number; floor?: number }

/** Scores a round that is over. Returns "wait" when its data isn't in yet, otherwise settles it. */
async function settleRound(tx: Tx, league: League, season: Season, round: Round, members: MemberRow[], now: Date): Promise<"wait" | "settled"> {
  const end = effectiveEnd(league, round)
  const playing = members.filter((m) => m.joinedAt.getTime() < end.getTime())
  const scored: Scored[] = []
  let late = false
  let decisions: Decision[] = []

  if (season.mode === "draft") {
    const picks = await tx
      .select({
        memberId: fantasyDraftPicks.memberId,
        entry: fantasyDraftPicks.entryPrice,
        exit: fantasyDraftPicks.exitPrice,
        exitAsOf: fantasyDraftPicks.exitAsOf,
        ticker: securities.tickerSymbol,
        slot: fantasyDraftPicks.slot,
      })
      .from(fantasyDraftPicks)
      .innerJoin(securities, eq(fantasyDraftPicks.securityId, securities.id))
      .where(eq(fantasyDraftPicks.roundId, round.id))
      .orderBy(asc(fantasyDraftPicks.slot))
    const slots = season.picksPerRound ?? DEFAULT_PICKS
    // The last session before the round ended is its final close. Exits older than that are flagged.
    const finalDay = dateKey(new Date(end.getTime() - 3 * 86_400_000))
    late = picks.some((p) => !p.exitAsOf || p.exitAsOf < finalDay)
    for (const m of playing) {
      const mine = picks.filter((p) => p.memberId === m.id)
      if (mine.length === 0) continue // sat the round out: not ranked, no points, no head-to-head
      const s = draftScore(mine.map((p) => ({ entry: p.entry === null ? null : n(p.entry), exit: p.exit === null ? null : n(p.exit) })), slots)
      scored.push({ memberId: m.id, userId: m.userId, percent: s.percent, floor: s.floor })
    }
    for (const p of picks) {
      const owner = members.find((m) => m.id === p.memberId)
      const entry = p.entry === null ? null : n(p.entry)
      const exit = p.exit === null ? null : n(p.exit)
      if (!owner || entry === null || exit === null || !(entry > 0)) continue
      decisions.push({ userId: owner.userId, ticker: p.ticker ?? "?", percent: percentChange(entry, exit), kind: "pick" })
    }
  } else {
    const memberIds = playing.map((m) => m.id)
    const since = new Date(round.startsAt.getTime() - 21 * 86_400_000)
    const snaps = memberIds.length
      ? await tx
          .select({ memberId: fantasySnapshots.memberId, date: fantasySnapshots.date, value: fantasySnapshots.value })
          .from(fantasySnapshots)
          .where(and(inArray(fantasySnapshots.memberId, memberIds), gte(fantasySnapshots.date, dateKey(since))))
          .orderBy(asc(fantasySnapshots.date))
      : []
    const history = new Map<string, { date: string; value: number }[]>()
    for (const s of snaps) history.set(s.memberId, [...(history.get(s.memberId) ?? []), { date: s.date, value: n(s.value) }])

    // Wait for the round's last-day snapshot, for everyone who was in a day before it ended.
    const expected = playing.filter((m) => m.joinedAt.getTime() < end.getTime() - 86_400_000)
    const dataIsIn = expected.every((m) => hasFinalSnapshot(history.get(m.id) ?? [], end))
    const decision = settleDecision(end, now, dataIsIn)
    if (decision === "wait") return "wait"
    late = decision === "settle-late"

    const live = await liveValues(tx, memberIds)
    const startingCash = n(league.startingCash)
    for (const m of playing) {
      const h = history.get(m.id) ?? []
      const start = roundStartValue(h, m.joinedAt, startingCash, round.startsAt)
      // A league that ended inside the round is scored at its final value, like the league table.
      const finish = league.endsAt && end.getTime() === league.endsAt.getTime() ? scoredValue(league.endsAt, h, live.get(m.id) ?? start, now) : roundEndValue(h, end, live.get(m.id) ?? start)
      if (!(start > 0)) continue
      scored.push({ memberId: m.id, userId: m.userId, percent: percentChange(start, finish) })
    }
    decisions = await tradeDecisions(tx, league.id, members, round.startsAt, end)
  }

  // Claim the round: only one caller writes its results.
  const [claimed] = await tx
    .update(fantasyRounds)
    .set({ status: "settled", settledAt: now, late })
    .where(and(eq(fantasyRounds.id, round.id), sql`${fantasyRounds.status} <> 'settled'`))
    .returning({ id: fantasyRounds.id })
  if (!claimed) return "settled"

  const ranked = rankRound(scored.map((s) => ({ ...s, key: s.userId })))
  if (ranked.length > 0) {
    await tx
      .insert(fantasyRoundResults)
      .values(ranked.map((r) => ({ roundId: round.id, memberId: r.memberId, userId: r.userId, returnPct: r.percent.toFixed(4), floorPct: r.floor === undefined ? null : r.floor.toFixed(4), rank: r.rank, points: r.points.toFixed(2) })))
      .onConflictDoNothing()
  }

  // Earlier results, for the table before this round and for streaks.
  const earlier = await loadSeasonResults(tx, season.id, round.number)
  const thisRound: RoundResult[] = ranked.map((r) => ({ roundNumber: round.number, userId: r.userId, percent: r.percent, rank: r.rank, points: r.points }))
  const before = seasonStandings(earlier)
  const after = seasonStandings([...earlier, ...thisRound])
  const people = new Map(members.map((m) => [m.userId, personOf(m)]))

  const awards = roundTrophies(round.number, thisRound, earlier)
  if (awards.length > 0) {
    await tx
      .insert(fantasyTrophies)
      .values(awards.map((a) => ({ leagueId: league.id, seasonId: season.id, userId: a.userId, kind: a.kind, roundNumber: a.roundNumber ?? 0 })))
      .onConflictDoNothing()
  }

  const recap = buildRecap({
    roundNumber: round.number,
    mode: season.mode as SeasonMode,
    people,
    results: thisRound,
    before,
    after,
    decisions,
    seasonRounds: season.roundCount,
  })
  if (ranked.length > 0) {
    await tx
      .insert(fantasyRecaps)
      .values({ roundId: round.id, leagueId: league.id, shareToken: randomBytes(12).toString("base64url"), payload: recap })
      .onConflictDoNothing()
  }

  // Notification-ready events: one personal line per player, plus trophies and overtakes.
  for (const r of thisRound) {
    await emit(tx, {
      leagueId: league.id,
      userId: r.userId,
      kind: "round_recap",
      dedupeKey: `round_recap:${round.id}:${r.userId}`,
      payload: { roundNumber: round.number, seasonNumber: season.number, rank: r.rank, players: thisRound.length, percent: Number(r.percent.toFixed(2)), headline: recap.headline },
    })
  }
  for (const a of awards) {
    await emit(tx, { leagueId: league.id, userId: a.userId, kind: "trophy", dedupeKey: `trophy:${season.id}:${a.userId}:${a.kind}:${a.roundNumber ?? 0}`, payload: { trophy: a.kind, roundNumber: a.roundNumber, seasonNumber: season.number } })
  }
  for (const o of recap.overtakes) {
    await emit(tx, { leagueId: league.id, userId: o.passed.userId, kind: "overtaken", dedupeKey: `overtaken:${round.id}:${o.passed.userId}:${o.who.userId}`, payload: { by: o.who.name, roundNumber: round.number } })
  }
  return "settled"
}

async function liveValues(tx: Tx, memberIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (memberIds.length === 0) return out
  const cash = await tx.select({ id: fantasyMembers.id, cash: fantasyMembers.cash }).from(fantasyMembers).where(inArray(fantasyMembers.id, memberIds))
  for (const c of cash) out.set(c.id, n(c.cash))
  const held = await tx.execute<{ member_id: string; value: string }>(sql`
    SELECT p.member_id, SUM(p.shares * COALESCE(s.close_price, 0)) AS value
    FROM fantasy_positions p JOIN securities s ON s.id = p.security_id
    WHERE p.member_id IN (${sql.join(memberIds.map((id) => sql`${id}`), sql`, `)}) GROUP BY p.member_id`)
  for (const h of held) out.set(h.member_id, (out.get(h.member_id) ?? 0) + n(h.value))
  return out
}

/** Each buy and sell made during the round, as a return since the trade at the latest price on file. */
async function tradeDecisions(tx: Tx, leagueId: string, members: MemberRow[], from: Date, to: Date): Promise<Decision[]> {
  const rows = await tx
    .select({ memberId: fantasyTrades.memberId, side: fantasyTrades.side, price: fantasyTrades.price, close: securities.closePrice, ticker: securities.tickerSymbol })
    .from(fantasyTrades)
    .innerJoin(securities, eq(fantasyTrades.securityId, securities.id))
    .where(and(eq(fantasyTrades.leagueId, leagueId), gte(fantasyTrades.createdAt, from), lt(fantasyTrades.createdAt, to)))
  const out: Decision[] = []
  for (const r of rows) {
    const owner = members.find((m) => m.id === r.memberId)
    const [price, close] = [n(r.price), n(r.close)]
    if (!owner || !(price > 0) || !(close > 0)) continue
    out.push({ userId: owner.userId, ticker: r.ticker ?? "?", percent: r.side === "buy" ? percentChange(price, close) : percentChange(close, price), kind: "trade" })
  }
  return out
}

async function loadSeasonResults(tx: Pick<typeof db, "select">, seasonId: string, beforeRound?: number): Promise<RoundResult[]> {
  const rows = await tx
    .select({ number: fantasyRounds.number, userId: fantasyRoundResults.userId, pct: fantasyRoundResults.returnPct, rank: fantasyRoundResults.rank, points: fantasyRoundResults.points })
    .from(fantasyRoundResults)
    .innerJoin(fantasyRounds, eq(fantasyRoundResults.roundId, fantasyRounds.id))
    .where(beforeRound === undefined ? eq(fantasyRounds.seasonId, seasonId) : and(eq(fantasyRounds.seasonId, seasonId), lt(fantasyRounds.number, beforeRound)))
  return rows.map((r) => ({ roundNumber: r.number, userId: r.userId, percent: n(r.pct), rank: r.rank, points: n(r.points) }))
}

export const loadResultsForSeason = (seasonId: string) => loadSeasonResults(db, seasonId)

async function completeSeason(tx: Tx, league: League, season: Season) {
  const [claimed] = await tx
    .update(fantasySeasons)
    .set({ status: "complete", completedAt: new Date() })
    .where(and(eq(fantasySeasons.id, season.id), eq(fantasySeasons.status, "active")))
    .returning({ id: fantasySeasons.id })
  if (!claimed) return
  const results = await loadSeasonResults(tx, season.id)
  const standings = seasonStandings(results)
  const rounds = new Set(results.map((r) => r.roundNumber)).size
  const awards = seasonTrophies(standings, rounds)
  if (awards.length > 0) {
    await tx
      .insert(fantasyTrophies)
      .values(awards.map((a) => ({ leagueId: league.id, seasonId: season.id, userId: a.userId, kind: a.kind, roundNumber: 0 })))
      .onConflictDoNothing()
  }
  for (const a of awards) {
    await emit(tx, { leagueId: league.id, userId: a.userId, kind: "trophy", dedupeKey: `trophy:${season.id}:${a.userId}:${a.kind}:0`, payload: { trophy: a.kind, seasonNumber: season.number } })
  }
  await emit(tx, { leagueId: league.id, kind: "season_complete", dedupeKey: `season_complete:${season.id}`, payload: { seasonNumber: season.number, championUserIds: standings.filter((s) => s.rank === 1).map((s) => s.userId) } })
}

/** Nightly backstop: advance every league that has a season still running, or none yet. */
export async function advanceAllLeagues(now = new Date()) {
  const rows = await db.select({ id: fantasyLeagues.id }).from(fantasyLeagues)
  let failed = 0
  for (const { id } of rows) {
    try {
      await advanceLeague(id, now)
    } catch (error) {
      failed++
      console.error("[seasons] advancing a league failed:", id, error instanceof Error ? error.message : error)
    }
  }
  return { leagues: rows.length, failed }
}

