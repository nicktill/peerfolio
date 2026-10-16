import "server-only"
import { and, asc, desc, eq, inArray, gte } from "drizzle-orm"
import {
  db,
  fantasyDraftPicks,
  fantasyMembers,
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
  DEFAULT_PICKS,
  draftScore,
  headToHead,
  msToDeadline,
  percentChange,
  picksOpen,
  rankRound,
  roundNumberAt,
  roundStartValue,
  roundWindow,
  seasonEnd,
  seasonStandings,
  type RoundRecap,
  type TrophyKind,
} from "@web/lib/fantasy-season"
import { advanceLeague, ensureSeason, latestSeason, loadResultsForSeason } from "@web/lib/fantasy-seasons"
import { requireFantasyMember } from "@web/lib/fantasy"
import { loadNotesFor, type NoteView } from "@web/lib/fantasy-notes"
import { displaySymbol } from "@web/lib/market-data"
import { sql } from "drizzle-orm"

const n = (v: string | null | undefined) => (v == null ? 0 : Number(v))

export type SeasonPerson = { userId: string; name: string | null; handle: string | null; image: string | null; isYou: boolean }
export type PickView = { id: string; ticker: string; name: string | null; slot: number; percent: number | null; note: NoteView | null }

export type RoundRow = SeasonPerson & { rank: number; percent: number; points: number; picks?: PickView[]; picked?: boolean }

export type SeasonView = {
  league: { id: string; name: string; emoji: string; accent: string; isOwner: boolean; isClosed: boolean }
  season: {
    id: string
    number: number
    mode: "trading" | "draft"
    status: "active" | "complete"
    roundCount: number | null
    picksPerRound: number | null
    startsAt: string
    endsAt: string | null
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
  recap: (RoundRecap & { token: string }) | null
  canStartNext: boolean
}

export async function loadSeasonView(userId: string, leagueId: string, now = new Date()): Promise<SeasonView> {
  const { league } = await requireFantasyMember(userId, leagueId)
  try {
    await advanceLeague(leagueId, now)
  } catch (error) {
    // Show the last good state rather than a broken page.
    console.error("[seasons] advance failed:", error instanceof Error ? error.message : error)
  }
  const season = (await latestSeason(leagueId))!
  const closed = isClosed(league.endsAt, now)

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
      .select({ roundId: fantasyRecaps.roundId, token: fantasyRecaps.shareToken, payload: fantasyRecaps.payload })
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

  const inProgress = roundNumberAt(season.startsAt, now, season.roundCount)
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
        recapToken: recapByRound.get(r.id)?.token ?? null,
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
  const open = season.mode === "draft" && season.status === "active" ? rounds.find((r) => r.status === "open" && r.startsAt.getTime() > now.getTime()) : undefined
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
    league: { id: league.id, name: league.name, emoji: league.emoji, accent: league.accent, isOwner: league.ownerId === userId, isClosed: closed },
    season: {
      id: season.id,
      number: season.number,
      mode: season.mode as "trading" | "draft",
      status: season.status as "active" | "complete",
      roundCount: season.roundCount,
      picksPerRound: season.picksPerRound,
      startsAt: season.startsAt.toISOString(),
      endsAt: seasonEnd(season.startsAt, season.roundCount)?.toISOString() ?? null,
      state,
    },
    current,
    draft,
    standings,
    rounds: roundsView,
    headToHead: headToHeadView,
    trophies: trophyRows.map((t) => ({ userId: t.userId, name: person(t.userId).name, kind: t.kind as TrophyKind, roundNumber: t.roundNumber, seasonNumber: t.seasonNumber })),
    seasons: allSeasons.map((s) => ({ number: s.number, mode: s.mode as "trading" | "draft", status: s.status, roundCount: s.roundCount, champions: champions(s.number) })),
    recap: lastRecap ? { ...(lastRecap.payload as RoundRecap), token: lastRecap.token } : null,
    canStartNext: league.ownerId === userId && season.status === "complete" && !closed,
  }
}

/* ------------------------------------------------------------------ */

type League = Awaited<ReturnType<typeof requireFantasyMember>>["league"]
type MemberLite = { id: string; userId: string; joinedAt: Date }

async function liveTradingRows(league: League, members: MemberLite[], start: Date, person: (id: string) => SeasonPerson): Promise<RoundRow[]> {
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
}

/**
 * One-line round status for each league on the list. Reads the season rows and
 * the clock only (no pricing, no settling), so the list stays quick. A league
 * that has never been opened since seasons shipped gets its default season here.
 */
export async function loadRoundChips(userId: string, leagueIds: string[], now = new Date()): Promise<Map<string, RoundChip>> {
  const out = new Map<string, RoundChip>()
  if (leagueIds.length === 0) return out
  for (const leagueId of leagueIds) await ensureSeason(leagueId, undefined, now)
  const seasons = await db.select().from(fantasySeasons).where(inArray(fantasySeasons.leagueId, leagueIds)).orderBy(desc(fantasySeasons.number))
  const latest = new Map<string, (typeof seasons)[number]>()
  for (const s of seasons) if (!latest.has(s.leagueId)) latest.set(s.leagueId, s)

  const draftIds = [...latest.values()].filter((s) => s.mode === "draft" && s.status === "active").map((s) => s.id)
  const mine = draftIds.length
    ? await db
        .select({ seasonId: fantasyRounds.seasonId, roundNumber: fantasyRounds.number })
        .from(fantasyDraftPicks)
        .innerJoin(fantasyRounds, eq(fantasyDraftPicks.roundId, fantasyRounds.id))
        .innerJoin(fantasyMembers, eq(fantasyDraftPicks.memberId, fantasyMembers.id))
        .where(and(inArray(fantasyRounds.seasonId, draftIds), eq(fantasyMembers.userId, userId)))
    : []
  const picked = new Set(mine.map((m) => `${m.seasonId}:${m.roundNumber}`))

  for (const [leagueId, s] of latest) {
    const mode = s.mode as "trading" | "draft"
    const current = roundNumberAt(s.startsAt, now, s.roundCount)
    const base = { mode, seasonNumber: s.number }
    if (s.status === "complete") {
      out.set(leagueId, { ...base, state: "complete", round: s.roundCount ?? current, at: null, kind: "complete", needsPicks: false })
    } else if (current === 0) {
      out.set(leagueId, { ...base, state: "upcoming", round: 1, at: s.startsAt.toISOString(), kind: "upcoming", needsPicks: mode === "draft" && !picked.has(`${s.id}:1`) })
    } else if (mode === "draft") {
      const next = current + 1
      const hasNext = s.roundCount === null || next <= s.roundCount
      if (hasNext) {
        const deadline = roundWindow(s.startsAt, next).startsAt
        out.set(leagueId, { ...base, state: "running", round: next, at: deadline.toISOString(), kind: "draft-open", needsPicks: !picked.has(`${s.id}:${next}`) })
      } else {
        out.set(leagueId, { ...base, state: "running", round: current, at: roundWindow(s.startsAt, current).endsAt.toISOString(), kind: "round-locked", needsPicks: false })
      }
    } else {
      out.set(leagueId, { ...base, state: "running", round: current, at: roundWindow(s.startsAt, current).endsAt.toISOString(), kind: "round-live", needsPicks: false })
    }
  }
  return out
}
