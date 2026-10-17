import "server-only"
import { and, asc, desc, eq, inArray, gte } from "drizzle-orm"
import {
  db,
  fantasyDraftPicks,
  fantasyMembers,
  fantasyLeagues,
  fantasyRecaps,
  fantasyRoundResults,
  fantasyRounds,
  fantasySeasons,
  fantasySnapshots,
  fantasyTrophies,
  securities,
  users,
} from "@web/db"
import { isClosed } from "@web/lib/fantasy-rules"
import {
  dateKey,
  formatSigned,
  DEFAULT_PICKS,
  draftScore,
  headToHead,
  msToDeadline,
  percentChange,
  picksOpen,
  rankRound,
  asCadence,
  nextPeriodStart,
  CADENCES,
  type Cadence,
  roundNumberAt,
  roundStartValue,
  roundWindow,
  seasonEnd,
  seasonStandings,
  type RoundRecap,
  type TrophyKind,
} from "@web/lib/fantasy-season"
import { advanceLeague, latestSeason, loadResultsForSeason } from "@web/lib/fantasy-seasons"
import { requireFantasyMember } from "@web/lib/fantasy"
import { loadNotesFor, type NoteView } from "@web/lib/fantasy-notes"
import { displaySymbol } from "@web/lib/market-data"
import { sql } from "drizzle-orm"

const n = (v: string | null | undefined) => (v == null ? 0 : Number(v))

export type SeasonPerson = { userId: string; name: string | null; handle: string | null; image: string | null; isYou: boolean }
export type PickView = { id: string; ticker: string; name: string | null; slot: number; percent: number | null; note: NoteView | null }

export type RoundRow = SeasonPerson & { rank: number; percent: number; points: number; picks?: PickView[]; picked?: boolean }

export type SeasonView = {
  league: { id: string; name: string; emoji: string; accent: string; isOwner: boolean; isClosed: boolean; inviteCode: string; endsAt: string | null }
  season: {
    id: string
    number: number
    mode: "trading" | "draft"
    status: "active" | "complete"
    roundCount: number | null
    picksPerRound: number | null
    startsAt: string
    endsAt: string | null
    /** How long a round lasts. Seasons from before cadences existed are weekly. */
    cadence: Cadence
    /** "upcoming" before round 1, "running", or "complete". */
    state: "upcoming" | "running" | "complete"
  }
  /** The round being played now (live standings), if any. */
  current: null | { number: number; startsAt: string; endsAt: string; locked: boolean; rows: RoundRow[]; late: boolean }
  /** Draft only: the round open for picks. */
  draft: null | { roundId: string; number: number; deadline: string; msLeft: number; open: boolean; slots: number; yours: PickView[]; waitingOn: SeasonPerson[]; submitted: number; players: number }
  standings: (SeasonPerson & { rank: number; points: number; wins: number; rounds: number; compounded: number; best: number })[]
  rounds: { number: number; startsAt: string; endsAt: string; late: boolean; winners: string[]; yourRank: number | null; yourPercent: number | null; players: number; table: RoundRow[]; recapToken: string | null }[]
  headToHead: { opponent: SeasonPerson; wins: number; losses: number; ties: number }[]
  trophies: { userId: string; name: string | null; kind: TrophyKind; roundNumber: number; seasonNumber: number }[]
  seasons: { number: number; mode: "trading" | "draft"; status: string; roundCount: number | null; champions: string[] }[]
  /** The latest recap. `token` is null while the owner has sharing off. */
  recap: (RoundRecap & { token: string | null; sharing: boolean }) | null
  canStartNext: boolean
}

/** A league that never turned weekly rounds on. Reading it creates nothing. */
export type NoSeason = { none: true; league: { id: string; name: string; emoji: string; accent: string; isOwner: boolean; isClosed: boolean; inviteCode: string; endsAt: string | null }; /** The next boundary of each cadence (ISO), the default start dates for turning seasons on. */ nextStarts: Record<Cadence, string> }

export async function loadSeasonView(userId: string, leagueId: string, now = new Date()): Promise<SeasonView | NoSeason> {
  const { league } = await requireFantasyMember(userId, leagueId)
  try {
    await advanceLeague(leagueId, now)
  } catch (error) {
    // Show the last good state rather than a broken page.
    console.error("[seasons] advance failed:", error instanceof Error ? error.message : error)
  }
  const season = await latestSeason(leagueId)
  const closed = isClosed(league.endsAt, now)
  const leagueView = { id: league.id, name: league.name, emoji: league.emoji, accent: league.accent, isOwner: league.ownerId === userId, isClosed: closed, inviteCode: league.inviteCode, endsAt: league.endsAt?.toISOString() ?? null }
  if (!season) return { none: true, league: leagueView, nextStarts: Object.fromEntries(CADENCES.map((c) => [c, nextPeriodStart(now, c).toISOString()])) as Record<Cadence, string> }

  const members = await db
    .select({ id: fantasyMembers.id, userId: fantasyMembers.userId, joinedAt: fantasyMembers.joinedAt, name: users.name, handle: users.handle, image: users.image })
    .from(fantasyMembers)
    .innerJoin(users, eq(fantasyMembers.userId, users.id))
    .where(eq(fantasyMembers.leagueId, leagueId))
  const person = (id: string): SeasonPerson => {
    const m = members.find((x) => x.userId === id)
    return { userId: id, name: m?.name ?? null, handle: m?.handle ?? null, image: m?.image ?? null, isYou: id === userId }
  }

  const [rounds, results, recaps, trophyRows, allSeasons] = await Promise.all([
    db.select().from(fantasyRounds).where(eq(fantasyRounds.seasonId, season.id)).orderBy(asc(fantasyRounds.number)),
    loadResultsForSeason(season.id),
    db
      .select({ roundId: fantasyRecaps.roundId, token: fantasyRecaps.shareToken, sharing: fantasyRecaps.sharing, payload: fantasyRecaps.payload })
      .from(fantasyRecaps)
      .innerJoin(fantasyRounds, eq(fantasyRecaps.roundId, fantasyRounds.id))
      .where(eq(fantasyRounds.seasonId, season.id)),
    db
      .select({ userId: fantasyTrophies.userId, kind: fantasyTrophies.kind, roundNumber: fantasyTrophies.roundNumber, seasonNumber: fantasySeasons.number })
      .from(fantasyTrophies)
      .innerJoin(fantasySeasons, eq(fantasyTrophies.seasonId, fantasySeasons.id))
      .where(eq(fantasyTrophies.leagueId, leagueId))
      .orderBy(desc(fantasySeasons.number), desc(fantasyTrophies.roundNumber)),
    db.select().from(fantasySeasons).where(eq(fantasySeasons.leagueId, leagueId)).orderBy(desc(fantasySeasons.number)),
  ])

  const cadence = asCadence(season.cadence)
  const inProgress = roundNumberAt(season.startsAt, now, season.roundCount, cadence)
  const state: SeasonView["season"]["state"] = season.status === "complete" ? "complete" : inProgress === 0 ? "upcoming" : "running"

  /* Settled rounds, newest first. */
  const resultsByRound = new Map<number, typeof results>()
  for (const r of results) resultsByRound.set(r.roundNumber, [...(resultsByRound.get(r.roundNumber) ?? []), r])
  const recapByRound = new Map(recaps.map((r) => [r.roundId, r]))
  const settledRounds = rounds.filter((r) => r.status === "settled")
  const pickRows = settledRounds.length && season.mode === "draft" ? await loadPicks(settledRounds.map((r) => r.id), userId, false) : new Map<string, Map<string, PickView[]>>()
  const roundsView: SeasonView["rounds"] = settledRounds
    .map((r) => {
      const list = (resultsByRound.get(r.number) ?? []).sort((a, b) => a.rank - b.rank)
      const mine = list.find((x) => x.userId === userId)
      const byMember = pickRows.get(r.id)
      return {
        number: r.number,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        late: r.late,
        winners: list.filter((x) => x.rank === 1).map((x) => x.userId),
        yourRank: mine?.rank ?? null,
        yourPercent: mine?.percent ?? null,
        players: list.length,
        table: list.map((x) => ({ ...person(x.userId), rank: x.rank, percent: x.percent, points: x.points, picks: byMember?.get(members.find((m) => m.userId === x.userId)?.id ?? "") })),
        recapToken: recapByRound.get(r.id)?.sharing ? (recapByRound.get(r.id)?.token ?? null) : null,
      }
    })
    .sort((a, b) => b.number - a.number)

  /* Season table and head to head. */
  const standings = seasonStandings(results).map((row) => ({ ...person(row.userId), ...row }))
  const h2h = headToHead(results).get(userId)
  const headToHeadView = [...(h2h?.entries() ?? [])].map(([opponent, rec]) => ({ opponent: person(opponent), ...rec })).sort((a, b) => b.wins - b.losses - (a.wins - a.losses))

  /* The round being played, with live numbers. */
  const liveRound = rounds.find((r) => r.status !== "settled" && r.startsAt.getTime() <= now.getTime() && r.endsAt.getTime() > now.getTime()) ?? null
  let current: SeasonView["current"] = null
  if (liveRound && state !== "complete") {
    const rows = season.mode === "draft" ? await liveDraftRows(liveRound.id, members, season.picksPerRound ?? DEFAULT_PICKS, userId, person) : await liveTradingRows(league, members, liveRound.startsAt, person)
    current = { number: liveRound.number, startsAt: liveRound.startsAt.toISOString(), endsAt: liveRound.endsAt.toISOString(), locked: liveRound.status === "locked", rows, late: false }
  }

  /* The draft open for picks. */
  let draft: SeasonView["draft"] = null
  const open = season.mode === "draft" && season.status === "active" ? rounds.find((r) => r.status === "open" && r.startsAt.getTime() > now.getTime() && (season.roundCount === null || r.number <= season.roundCount)) : undefined
  if (open) {
    const picks = await loadPicks([open.id], userId, true)
    const byMember = picks.get(open.id) ?? new Map<string, PickView[]>()
    const mine = members.find((m) => m.userId === userId)
    const waitingOn = members.filter((m) => !byMember.has(m.id)).map((m) => person(m.userId))
    draft = {
      roundId: open.id,
      number: open.number,
      deadline: open.startsAt.toISOString(),
      msLeft: msToDeadline(open.startsAt, now),
      open: picksOpen(open.startsAt, now),
      slots: season.picksPerRound ?? DEFAULT_PICKS,
      yours: (mine && byMember.get(mine.id)) || [],
      waitingOn,
      submitted: byMember.size,
      players: members.length,
    }
  }

  /* Latest recap. */
  const lastSettled = settledRounds.at(-1)
  const lastRecap = lastSettled ? recapByRound.get(lastSettled.id) : undefined

  const champions = (num: number) => trophyRows.filter((t) => t.kind === "season_champion" && t.seasonNumber === num).map((t) => person(t.userId).name ?? "Player")

  return {
    league: leagueView,
    season: {
      id: season.id,
      number: season.number,
      mode: season.mode as "trading" | "draft",
      status: season.status as "active" | "complete",
      roundCount: season.roundCount,
      picksPerRound: season.picksPerRound,
      startsAt: season.startsAt.toISOString(),
      endsAt: seasonEnd(season.startsAt, season.roundCount, cadence)?.toISOString() ?? null,
      cadence,
      state,
    },
    current,
    draft,
    standings,
    rounds: roundsView,
    headToHead: headToHeadView,
    trophies: trophyRows.map((t) => ({ userId: t.userId, name: person(t.userId).name, kind: t.kind as TrophyKind, roundNumber: t.roundNumber, seasonNumber: t.seasonNumber })),
    seasons: allSeasons.map((s) => ({ number: s.number, mode: s.mode as "trading" | "draft", status: s.status, roundCount: s.roundCount, champions: champions(s.number) })),
    recap: lastRecap ? { ...(await resolveRecapNames(lastRecap.payload as RoundRecap)), token: lastRecap.sharing ? lastRecap.token : null, sharing: lastRecap.sharing } : null,
    canStartNext: league.ownerId === userId && season.status === "complete" && !closed,
  }
}

/* ------------------------------------------------------------------ */

type League = Awaited<ReturnType<typeof requireFantasyMember>>["league"]
type MemberLite = { id: string; userId: string; joinedAt: Date }

async function liveTradingRows(league: League, everyone: MemberLite[], start: Date, person: (id: string) => SeasonPerson): Promise<RoundRow[]> {
  // Same rule as settling: in the league when the round began.
  const members = everyone.filter((m) => m.joinedAt.getTime() <= start.getTime())
  const ids = members.map((m) => m.id)
  if (ids.length === 0) return []
  const startingCash = n(league.startingCash)
  const [cash, held, snaps] = await Promise.all([
    db.select({ id: fantasyMembers.id, cash: fantasyMembers.cash }).from(fantasyMembers).where(inArray(fantasyMembers.id, ids)),
    db.execute<{ member_id: string; value: string }>(sql`
      SELECT p.member_id, SUM(p.shares * COALESCE(s.close_price, 0)) AS value
      FROM fantasy_positions p JOIN securities s ON s.id = p.security_id
      WHERE p.member_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) GROUP BY p.member_id`),
    db
      .select({ memberId: fantasySnapshots.memberId, date: fantasySnapshots.date, value: fantasySnapshots.value })
      .from(fantasySnapshots)
      .where(and(inArray(fantasySnapshots.memberId, ids), gte(fantasySnapshots.date, dateKey(new Date(start.getTime() - 21 * 86_400_000)))))
      .orderBy(asc(fantasySnapshots.date)),
  ])
  const live = new Map(cash.map((c) => [c.id, n(c.cash)]))
  for (const h of held) live.set(h.member_id, (live.get(h.member_id) ?? 0) + n(h.value))
  const history = new Map<string, { date: string; value: number }[]>()
  for (const s of snaps) history.set(s.memberId, [...(history.get(s.memberId) ?? []), { date: s.date, value: n(s.value) }])
  const scored = members
    .map((m) => ({ key: m.userId, percent: percentChange(roundStartValue(history.get(m.id) ?? [], m.joinedAt, startingCash, start), live.get(m.id) ?? startingCash) }))
  return rankRound(scored).map((r) => ({ ...person(r.key), rank: r.rank, percent: r.percent, points: r.points }))
}

async function liveDraftRows(roundId: string, members: MemberLite[], slots: number, viewer: string, person: (id: string) => SeasonPerson): Promise<RoundRow[]> {
  // Locked: everyone's picks are public, scored on the latest close on file.
  const picks = await loadPicks([roundId], viewer, true, true)
  const byMember = picks.get(roundId) ?? new Map<string, PickView[]>()
  const scored = members
    .filter((m) => byMember.has(m.id))
    .map((m) => {
      const list = byMember.get(m.id)!
      const s = draftScore(list.map((p) => (p.percent === null ? { entry: null, exit: null } : { entry: 100, exit: 100 + p.percent })), slots)
      return { key: m.userId, memberId: m.id, percent: s.percent, floor: s.floor }
    })
  const ranked = rankRound(scored).map((r) => ({ ...person(r.key), rank: r.rank, percent: r.percent, points: r.points, picks: byMember.get(r.memberId) }))
  const sat = members.filter((m) => !byMember.has(m.id)).map((m) => ({ ...person(m.userId), rank: 0, percent: 0, points: 0, picked: false }))
  return [...ranked, ...sat]
}

/**
 * Picks of the given rounds as `roundId -> memberId -> picks`. Before a round locks
 * only the viewer's own picks are returned (nobody can copy a pick they can't see);
 * `everyone` reveals all of them, for locked and settled rounds.
 */
async function loadPicks(roundIds: string[], viewer: string, hideOthers: boolean, everyone = false): Promise<Map<string, Map<string, PickView[]>>> {
  const out = new Map<string, Map<string, PickView[]>>()
  if (roundIds.length === 0) return out
  const rows = await db
    .select({
      id: fantasyDraftPicks.id,
      roundId: fantasyDraftPicks.roundId,
      memberId: fantasyDraftPicks.memberId,
      slot: fantasyDraftPicks.slot,
      entry: fantasyDraftPicks.entryPrice,
      exit: fantasyDraftPicks.exitPrice,
      now: securities.closePrice,
      ticker: securities.tickerSymbol,
      marketTicker: securities.marketTicker,
      name: securities.name,
      status: fantasyRounds.status,
      userId: fantasyMembers.userId,
    })
    .from(fantasyDraftPicks)
    .innerJoin(securities, eq(fantasyDraftPicks.securityId, securities.id))
    .innerJoin(fantasyRounds, eq(fantasyDraftPicks.roundId, fantasyRounds.id))
    .innerJoin(fantasyMembers, eq(fantasyDraftPicks.memberId, fantasyMembers.id))
    .where(inArray(fantasyDraftPicks.roundId, roundIds))
    .orderBy(asc(fantasyDraftPicks.slot))
  const notes = await loadNotesFor({ pickIds: rows.map((r) => r.id) }, viewer)
  for (const r of rows) {
    const visible = everyone || r.status !== "open" || r.userId === viewer || !hideOthers
    const byMember = out.get(r.roundId) ?? new Map<string, PickView[]>()
    out.set(r.roundId, byMember)
    // Before the lock, others' picks only show as "has picked", never what.
    const list = byMember.get(r.memberId) ?? []
    byMember.set(r.memberId, list)
    if (!visible) continue
    const entry = r.entry === null ? null : n(r.entry)
    const exit = r.status === "settled" ? (r.exit === null ? null : n(r.exit)) : n(r.now) || null
    list.push({
      id: r.id,
      ticker: r.ticker ?? displaySymbol(r.marketTicker ?? "?"),
      name: r.name,
      slot: r.slot,
      percent: entry && exit && entry > 0 ? percentChange(entry, exit) : null,
      note: notes.get(`pick:${r.id}`) ?? null,
    })
  }
  return out
}

/* ------------------------------------------------------------------ */

/** Names in a stored recap are current, not frozen: someone who has left or deleted their account becomes "A former member". */
export async function resolveRecapNames(recap: RoundRecap): Promise<RoundRecap> {
  const ids = new Set<string>()
  const collect = (p: { userId: string } | null | undefined) => p && ids.add(p.userId)
  recap.winners.forEach(collect)
  collect(recap.loser)
  recap.table.forEach(collect)
  recap.overtakes.forEach((o) => (collect(o.who), collect(o.passed)))
  collect(recap.bestDecision)
  collect(recap.worstDecision)
  collect(recap.leader)
  if (ids.size === 0) return recap
  const rows = await db.select({ id: users.id, name: users.name, handle: users.handle }).from(users).where(inArray(users.id, [...ids]))
  const live = new Map(rows.map((r) => [r.id, { name: r.name?.split(" ")[0] ?? r.handle ?? "A former member", handle: r.handle }]))
  const fix = <T extends { userId: string; name: string; handle: string | null }>(p: T): T => ({ ...p, ...(live.get(p.userId) ?? { name: "A former member", handle: null }) })
  const headline = recap.headline
  let next = headline
  // The headline was written with the name at the time; rewrite it from the live winners.
  if (recap.winners.length > 0) {
    const names = recap.winners.map((w) => fix(w).name)
    const pct = recap.winners[0]!.percent
    next = names.length === 1 ? `${names[0]} takes Round ${recap.roundNumber} with ${formatSigned(pct)}` : `${names.join(" and ")} share Round ${recap.roundNumber} at ${formatSigned(pct)}`
  }
  return {
    ...recap,
    headline: next,
    winners: recap.winners.map(fix),
    loser: recap.loser ? fix(recap.loser) : null,
    table: recap.table.map(fix),
    overtakes: recap.overtakes.map((o) => ({ who: fix(o.who), passed: fix(o.passed) })),
    bestDecision: recap.bestDecision ? fix(recap.bestDecision) : null,
    worstDecision: recap.worstDecision ? fix(recap.worstDecision) : null,
    leader: recap.leader ? fix(recap.leader) : null,
  }
}

/**
 * A recap by its share token, for the public page and image. Percentages and
 * first names only, and not what anyone bought: tickers are removed. The token is
 * the permission: it is random, it only works while the owner has sharing on, and
 * stopping sharing replaces it.
 */
export async function loadPublicRecap(token: string): Promise<{ recap: RoundRecap; league: { name: string; emoji: string; accent: string }; seasonNumber: number } | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null
  const [row] = await db
    .select({ payload: fantasyRecaps.payload, name: fantasyLeagues.name, emoji: fantasyLeagues.emoji, accent: fantasyLeagues.accent, seasonNumber: fantasySeasons.number })
    .from(fantasyRecaps)
    .innerJoin(fantasyRounds, eq(fantasyRecaps.roundId, fantasyRounds.id))
    .innerJoin(fantasySeasons, eq(fantasyRounds.seasonId, fantasySeasons.id))
    .innerJoin(fantasyLeagues, eq(fantasyRecaps.leagueId, fantasyLeagues.id))
    .where(and(eq(fantasyRecaps.shareToken, token), eq(fantasyRecaps.sharing, true)))
  if (!row) return null
  const recap = await resolveRecapNames(row.payload as RoundRecap)
  const scrub = <T extends { ticker: string } | null>(d: T): T => (d ? { ...d, ticker: "" } : d)
  return { recap: { ...recap, bestDecision: scrub(recap.bestDecision), worstDecision: scrub(recap.worstDecision) }, league: { name: row.name, emoji: row.emoji, accent: row.accent }, seasonNumber: row.seasonNumber }
}

export type RoundChip = {
  mode: "trading" | "draft"
  state: "upcoming" | "running" | "complete"
  seasonNumber: number
  /** The round in progress, or the one being drafted. */
  round: number
  /** Draft rounds open for picks: when they lock. Otherwise when the round in progress ends. */
  at: string | null
  kind: "draft-open" | "round-live" | "round-locked" | "upcoming" | "complete"
  needsPicks: boolean
  /** Your place in the season table, once a round has settled. */
  seasonRank: number | null
  seasonPoints: number | null
  seasonPlayers: number
  /** The top of the season table (up to three), for a small leaderboard on the list. Empty until a round settles or when everyone is level. */
  leaders: { userId: string; name: string | null; image: string | null; points: number; rank: number; isYou: boolean }[]
}

/**
 * One-line round status for each league on the list. Read-only and batched: three
 * queries however many leagues, no pricing, no settling, and no writes. A league that
 * never turned rounds on has no season and gets no chip.
 */
export async function loadRoundChips(userId: string, leagueIds: string[], now = new Date()): Promise<Map<string, RoundChip>> {
  const out = new Map<string, RoundChip>()
  if (leagueIds.length === 0) return out
  const seasons = await db.select().from(fantasySeasons).where(inArray(fantasySeasons.leagueId, leagueIds)).orderBy(desc(fantasySeasons.number))
  const latest = new Map<string, (typeof seasons)[number]>()
  for (const s of seasons) if (!latest.has(s.leagueId)) latest.set(s.leagueId, s)
  if (latest.size === 0) return out
  const seasonIds = [...latest.values()].map((s) => s.id)

  const [mine, resultRows] = await Promise.all([
    db
      .select({ seasonId: fantasyRounds.seasonId, roundNumber: fantasyRounds.number })
      .from(fantasyDraftPicks)
      .innerJoin(fantasyRounds, eq(fantasyDraftPicks.roundId, fantasyRounds.id))
      .innerJoin(fantasyMembers, eq(fantasyDraftPicks.memberId, fantasyMembers.id))
      .where(and(inArray(fantasyRounds.seasonId, seasonIds), eq(fantasyMembers.userId, userId))),
    db
      .select({ seasonId: fantasyRounds.seasonId, number: fantasyRounds.number, userId: fantasyRoundResults.userId, pct: fantasyRoundResults.returnPct, rank: fantasyRoundResults.rank, points: fantasyRoundResults.points })
      .from(fantasyRoundResults)
      .innerJoin(fantasyRounds, eq(fantasyRoundResults.roundId, fantasyRounds.id))
      .where(inArray(fantasyRounds.seasonId, seasonIds)),
  ])
  const picked = new Set(mine.map((m) => `${m.seasonId}:${m.roundNumber}`))
  const bySeason = new Map<string, { roundNumber: number; userId: string; percent: number; rank: number; points: number }[]>()
  for (const r of resultRows) bySeason.set(r.seasonId, [...(bySeason.get(r.seasonId) ?? []), { roundNumber: r.number, userId: r.userId, percent: n(r.pct), rank: r.rank, points: n(r.points) }])

  const tables = new Map([...latest.values()].map((s) => [s.id, seasonStandings(bySeason.get(s.id) ?? [])] as const))
  const leaderIds = [...new Set([...tables.values()].flatMap((t) => (t.length > 0 && t.every((r) => r.rank === 1) ? [] : t.slice(0, 3).map((r) => r.userId))))]
  const people = leaderIds.length > 0 ? await db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(inArray(users.id, leaderIds)) : []
  const person = new Map(people.map((p) => [p.id, p]))

  for (const [leagueId, s] of latest) {
    const mode = s.mode as "trading" | "draft"
    const table = tables.get(s.id) ?? []
    const you = table.find((t) => t.userId === userId)
    // Everyone level (all 0%, or a first round nobody played) is not a ranking worth showing.
    const level = table.length > 0 && table.every((t) => t.rank === 1)
    const leaders = level ? [] : table.slice(0, 3).map((r) => ({ userId: r.userId, name: person.get(r.userId)?.name ?? null, image: person.get(r.userId)?.image ?? null, points: r.points, rank: r.rank, isYou: r.userId === userId }))
    const base = { mode, seasonNumber: s.number, seasonRank: you && !level ? you.rank : null, seasonPoints: you ? you.points : null, seasonPlayers: table.length, leaders }
    const cadence = asCadence(s.cadence)
    const current = roundNumberAt(s.startsAt, now, s.roundCount, cadence)
    if (s.status === "complete") {
      out.set(leagueId, { ...base, state: "complete", round: s.roundCount ?? current, at: null, kind: "complete", needsPicks: false })
    } else if (current === 0) {
      out.set(leagueId, { ...base, state: "upcoming", round: 1, at: s.startsAt.toISOString(), kind: "upcoming", needsPicks: mode === "draft" && !picked.has(`${s.id}:1`) })
    } else if (mode === "draft") {
      const next = current + 1
      const hasNext = s.roundCount === null || next <= s.roundCount
      if (hasNext) {
        const deadline = roundWindow(s.startsAt, next, cadence).startsAt
        out.set(leagueId, { ...base, state: "running", round: next, at: deadline.toISOString(), kind: "draft-open", needsPicks: !picked.has(`${s.id}:${next}`) })
      } else {
        out.set(leagueId, { ...base, state: "running", round: current, at: roundWindow(s.startsAt, current, cadence).endsAt.toISOString(), kind: "round-locked", needsPicks: false })
      }
    } else {
      out.set(leagueId, { ...base, state: "running", round: current, at: roundWindow(s.startsAt, current, cadence).endsAt.toISOString(), kind: "round-live", needsPicks: false })
    }
  }
  return out
}
