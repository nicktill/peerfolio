/**
 * Seasons and rounds for fantasy leagues, as plain functions over numbers and dates.
 *
 * No database imports, so the tests run them directly. The database layer
 * (`fantasy-seasons.ts`) loads what these need and writes what they return.
 *
 * The model, in one paragraph: a league runs a *season* made of weekly *rounds*
 * (UTC calendar weeks, Monday 00:00 to the next Monday 00:00). Each round ranks
 * the players on one return number, and the rank becomes points. A season is the
 * sum of its rounds. Two kinds of season:
 *   - "trading": the round return is how the player's portfolio moved over the
 *     week (nightly snapshot to nightly snapshot).
 *   - "draft": everyone picks N stocks before the round's deadline, and the round
 *     return is the equal-weighted return of those picks, from the close at the
 *     lock to the close at the end of the round.
 */

import { visibleReturn } from "./return-display.ts"

export const DAY_MS = 86_400_000
export const WEEK_MS = 7 * DAY_MS

export type SeasonMode = "trading" | "draft"
export type RoundStatus = "open" | "locked" | "settled"

/* ------------------------------------------------------------------ *
 * Calendar
 * ------------------------------------------------------------------ */

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStart(date: Date): Date {
  const day = (date.getUTCDay() + 6) % 7 // Monday = 0
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day))
}

/** The first Monday 00:00 UTC strictly after `date`. */
export function nextWeekStart(date: Date): Date {
  return new Date(weekStart(date).getTime() + WEEK_MS)
}

/** `YYYY-MM-DD` in UTC, the key snapshots are stored under. */
export const dateKey = (date: Date) => date.toISOString().slice(0, 10)

/** Where round `number` (1-based) sits in a season that starts at `seasonStart`. */
export function roundWindow(seasonStart: Date, number: number): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(seasonStart.getTime() + (number - 1) * WEEK_MS)
  return { startsAt, endsAt: new Date(startsAt.getTime() + WEEK_MS) }
}

/**
 * The round in progress at `now`: 0 before the season starts, otherwise the
 * 1-based number, held at `roundCount` once a fixed-length season is past its end.
 */
export function roundNumberAt(seasonStart: Date, now: Date, roundCount: number | null): number {
  if (now.getTime() < seasonStart.getTime()) return 0
  const number = Math.floor((now.getTime() - seasonStart.getTime()) / WEEK_MS) + 1
  return roundCount === null ? number : Math.min(number, roundCount)
}

/** When a fixed-length season is scheduled to end, or null if it runs until someone wraps it up. */
export const seasonEnd = (seasonStart: Date, roundCount: number | null) => (roundCount === null ? null : roundWindow(seasonStart, roundCount).endsAt)

/**
 * The start for a new season: the next Monday, unless that is too close to ask
 * anyone to draft for (under `minLeadHours`), then the one after.
 */
export function nextSeasonStart(now: Date, mode: SeasonMode, minLeadHours = 12): Date {
  const next = nextWeekStart(now)
  if (mode === "draft" && next.getTime() - now.getTime() < minLeadHours * 3_600_000) return new Date(next.getTime() + WEEK_MS)
  return next
}

/* ------------------------------------------------------------------ *
 * Deadlines
 * ------------------------------------------------------------------ */

/** A draft round's picks lock at the moment the round starts. */
export const draftDeadline = (roundStartsAt: Date) => roundStartsAt

/** Picks may be changed up to, not at, the deadline. The server decides this, never the clock on the client. */
export const picksOpen = (deadline: Date, now: Date) => now.getTime() < deadline.getTime()

/** Milliseconds left to the deadline, never negative. */
export const msToDeadline = (deadline: Date, now: Date) => Math.max(0, deadline.getTime() - now.getTime())

/** After the end of a round the nightly data gets this long to arrive before the round settles on what exists. */
export const SETTLE_GRACE_MS = 2 * DAY_MS

/**
 * Whether a round whose time is up can be settled. It settles as soon as the
 * data it is scored on is in; failing that, once the grace period has passed.
 */
export function settleDecision(endsAt: Date, now: Date, dataIsIn: boolean): "wait" | "settle" | "settle-late" {
  if (now.getTime() < endsAt.getTime()) return "wait"
  if (dataIsIn) return "settle"
  return now.getTime() - endsAt.getTime() >= SETTLE_GRACE_MS ? "settle-late" : "wait"
}

/* ------------------------------------------------------------------ *
 * Trading-mode scoring (from nightly snapshots)
 * ------------------------------------------------------------------ */

export type Snapshot = { date: string; value: number }

const lastBefore = (history: Snapshot[], day: string) => {
  let found: Snapshot | undefined
  for (const s of history) if (s.date < day && (!found || s.date > found.date)) found = s
  return found
}

/**
 * What a member started a round with: starting cash if they joined during it,
 * otherwise their last nightly value before it. A member with no earlier
 * snapshot at all is taken to still hold their starting cash.
 */
export function roundStartValue(history: Snapshot[], joinedAt: Date, startingCash: number, roundStart: Date): number {
  if (joinedAt.getTime() >= roundStart.getTime()) return startingCash
  return lastBefore(history, dateKey(roundStart))?.value ?? startingCash
}

/**
 * What a member finished a round with: the last nightly value dated before the
 * round's end day (Sunday's, for a Monday-to-Monday week), or `fallback` when
 * none exists yet.
 */
export function roundEndValue(history: Snapshot[], roundEnd: Date, fallback: number): number {
  return lastBefore(history, dateKey(roundEnd))?.value ?? fallback
}

/** Whether a snapshot from the round's last day is on file, i.e. the round's data is in. */
export function hasFinalSnapshot(history: Snapshot[], roundEnd: Date): boolean {
  const lastDay = dateKey(new Date(roundEnd.getTime() - DAY_MS))
  return history.some((s) => s.date >= lastDay)
}

export const percentChange = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : 0)

/* ------------------------------------------------------------------ *
 * Draft-mode scoring
 * ------------------------------------------------------------------ */

export const MIN_PICKS = 1
export const MAX_PICKS = 10
export const DEFAULT_PICKS = 5

export type PickPrices = { ticker: string; entry: number | null; exit: number | null }

/** One pick's return, or null when either price is missing (an unpriced pick counts as cash). */
export function pickReturnPct(pick: Pick<PickPrices, "entry" | "exit">): number | null {
  if (pick.entry === null || pick.exit === null || !(pick.entry > 0) || !(pick.exit > 0)) return null
  return ((pick.exit - pick.entry) / pick.entry) * 100
}

/**
 * A player's draft score: the average return across all `slots`. A slot left
 * empty, or holding a pick we have no price for, counts as cash (0%), so
 * skipping picks is never an advantage or a forfeit. `floor` is the worst slot,
 * the tie-break between equal averages.
 */
export function draftScore(picks: Pick<PickPrices, "entry" | "exit">[], slots: number): { percent: number; floor: number; priced: number } {
  const returns = picks.slice(0, slots).map(pickReturnPct)
  const all = Array.from({ length: slots }, (_, i) => returns[i] ?? 0)
  const percent = all.reduce((sum, r) => sum + r, 0) / slots
  return { percent, floor: Math.min(...all), priced: returns.filter((r) => r !== null).length }
}

export type PicksCheck = { ok: true; tickers: string[] } | { ok: false; message: string }

/** Validates a submitted pick list: 1 to `slots` different tickers. Case and spacing are normalised. */
export function checkPicks(tickers: string[], slots: number): PicksCheck {
  const clean = tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)
  if (clean.length === 0) return { ok: false, message: "Pick at least one stock" }
  if (clean.length > slots) return { ok: false, message: `You can pick up to ${slots} stocks` }
  if (new Set(clean).size !== clean.length) return { ok: false, message: "Each pick has to be a different stock" }
  return { ok: true, tickers: clean }
}

/* ------------------------------------------------------------------ *
 * Ranking and points
 * ------------------------------------------------------------------ */

export type RoundEntry = {
  key: string
  /** The return the round is decided on. */
  percent: number
  /** The worst slot's return (draft rounds). Breaks a tie between equal returns. */
  floor?: number
}

/**
 * Ranks a round. Order: return as shown (two decimals), then the worse of each
 * player's picks (a player whose worst pick was better wins an exact tie), and
 * anyone still level shares the rank. Points are `field size - position + 1`;
 * players sharing a rank split the points of the positions they occupy, so a tie
 * for first of four is 3.5 each.
 */
export function rankRound<T extends RoundEntry>(entries: T[]): (T & { rank: number; points: number })[] {
  const level = (a: T, b: T) => visibleReturn(a.percent) === visibleReturn(b.percent) && (a.floor === undefined || b.floor === undefined || visibleReturn(a.floor) === visibleReturn(b.floor))
  const sorted = [...entries].sort((a, b) => {
    const byReturn = visibleReturn(b.percent) - visibleReturn(a.percent)
    if (byReturn !== 0) return byReturn
    if (a.floor !== undefined && b.floor !== undefined) return visibleReturn(b.floor) - visibleReturn(a.floor)
    return 0
  })
  const size = sorted.length
  const ranked: (T & { rank: number; points: number })[] = []
  let start = 0
  while (start < sorted.length) {
    let end = start + 1
    while (end < sorted.length && level(sorted[start]!, sorted[end]!)) end++
    // Positions start+1 .. end earn size - position + 1 points each; a tie splits their sum.
    let total = 0
    for (let position = start + 1; position <= end; position++) total += size - position + 1
    const points = total / (end - start)
    for (let i = start; i < end; i++) ranked.push({ ...sorted[i]!, rank: start + 1, points })
    start = end
  }
  return ranked
}

/* ------------------------------------------------------------------ *
 * Season standings, head to head, trophies
 * ------------------------------------------------------------------ */

export type RoundResult = { roundNumber: number; userId: string; percent: number; rank: number; points: number }

export type SeasonRow = {
  userId: string
  rank: number
  points: number
  wins: number
  rounds: number
  /** Rounds compounded: what a player would have if each week's return were reinvested. */
  compounded: number
  best: number
}

/**
 * The season table. Order: points, then compounded return, then round wins,
 * then best round; players level on all four share the rank.
 */
export function seasonStandings(results: RoundResult[]): SeasonRow[] {
  const by = new Map<string, RoundResult[]>()
  for (const r of results) by.set(r.userId, [...(by.get(r.userId) ?? []), r])
  const rows = [...by.entries()].map(([userId, list]) => ({
    userId,
    points: list.reduce((s, r) => s + r.points, 0),
    wins: list.filter((r) => r.rank === 1).length,
    rounds: list.length,
    compounded: (list.reduce((growth, r) => growth * (1 + r.percent / 100), 1) - 1) * 100,
    best: Math.max(...list.map((r) => r.percent)),
  }))
  const key = (r: (typeof rows)[number]) => [r.points, visibleReturn(r.compounded), r.wins, visibleReturn(r.best)] as const
  rows.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)]
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i]! - ka[i]!
    return 0
  })
  let rank = 1
  return rows.map((row, i) => {
    if (i > 0 && key(row).some((v, k) => v !== key(rows[i - 1]!)[k])) rank = i + 1
    return { ...row, rank }
  })
}

export type Record3 = { wins: number; losses: number; ties: number }

/**
 * Each player's record against each other player: in every settled round both
 * played, the better rank wins and equal ranks are a tie.
 */
export function headToHead(results: RoundResult[]): Map<string, Map<string, Record3>> {
  const byRound = new Map<number, RoundResult[]>()
  for (const r of results) byRound.set(r.roundNumber, [...(byRound.get(r.roundNumber) ?? []), r])
  const out = new Map<string, Map<string, Record3>>()
  const record = (a: string, b: string) => {
    const row = out.get(a) ?? new Map<string, Record3>()
    out.set(a, row)
    const rec = row.get(b) ?? { wins: 0, losses: 0, ties: 0 }
    row.set(b, rec)
    return rec
  }
  for (const round of byRound.values()) {
    for (const a of round) {
      for (const b of round) {
        if (a.userId === b.userId) continue
        const rec = record(a.userId, b.userId)
        if (a.rank < b.rank) rec.wins++
        else if (a.rank > b.rank) rec.losses++
        else rec.ties++
      }
    }
  }
  return out
}

export type TrophyKind = "round_win" | "hat_trick" | "season_champion" | "season_runner_up" | "season_third" | "perfect_season"

export type TrophyAward = { userId: string; kind: TrophyKind; roundNumber: number | null }

export const TROPHY_LABELS: Record<TrophyKind, { label: string; detail: string }> = {
  round_win: { label: "Round winner", detail: "Won a weekly round" },
  hat_trick: { label: "Hat trick", detail: "Won three rounds in a row" },
  season_champion: { label: "Champion", detail: "Finished the season in first place" },
  season_runner_up: { label: "Runner-up", detail: "Finished the season in second place" },
  season_third: { label: "Podium", detail: "Finished the season in third place" },
  perfect_season: { label: "Perfect season", detail: "Won every round of a season" },
}

/** Trophies earned by one settled round: the winner(s), plus a hat trick on a third straight win (fields of three or more). */
export function roundTrophies(roundNumber: number, results: RoundResult[], earlier: RoundResult[]): TrophyAward[] {
  const winners = results.filter((r) => r.rank === 1).map((r) => r.userId)
  // Nobody wins a round alone in a field of one, and a round where everyone shares first (all level,
  // or all at 0%) was not won by anyone.
  if (results.length < 2 || winners.length === results.length) return []
  const awards: TrophyAward[] = winners.map((userId) => ({ userId, kind: "round_win", roundNumber }))
  for (const userId of winners) {
    const wonBefore = (n: number) => earlier.some((r) => r.userId === userId && r.roundNumber === n && r.rank === 1)
    if (results.length >= 3 && roundNumber >= 3 && wonBefore(roundNumber - 1) && wonBefore(roundNumber - 2)) awards.push({ userId, kind: "hat_trick", roundNumber })
  }
  return awards
}

/**
 * Trophies for a finished season: first, second and third (only where the field
 * is big enough for them to mean something), and a perfect season for sweeping
 * a season of three or more rounds. Co-leaders each get the trophy.
 */
export function seasonTrophies(standings: SeasonRow[], rounds: number): TrophyAward[] {
  const size = standings.length
  if (size < 2) return []
  const awards: TrophyAward[] = []
  for (const row of standings) {
    if (row.rank === 1) awards.push({ userId: row.userId, kind: "season_champion", roundNumber: null })
    else if (row.rank === 2 && size >= 3) awards.push({ userId: row.userId, kind: "season_runner_up", roundNumber: null })
    else if (row.rank === 3 && size >= 4) awards.push({ userId: row.userId, kind: "season_third", roundNumber: null })
    if (row.rank === 1 && rounds >= 3 && row.wins === rounds) awards.push({ userId: row.userId, kind: "perfect_season", roundNumber: null })
  }
  return awards
}

/* ------------------------------------------------------------------ *
 * Recap
 * ------------------------------------------------------------------ */

export type Person = { userId: string; name: string; handle: string | null }
export type Decision = { userId: string; ticker: string; percent: number; kind: "pick" | "trade" }

/** Everything a recap says. Percentages and names only: no balances, no share counts, no dollar amounts. */
export type RoundRecap = {
  roundNumber: number
  mode: SeasonMode
  headline: string
  winners: (Person & { percent: number })[]
  loser: (Person & { percent: number }) | null
  table: (Person & { rank: number; percent: number; points: number })[]
  overtakes: { who: Person; passed: Person }[]
  bestDecision: (Person & Decision) | null
  worstDecision: (Person & Decision) | null
  leader: (Person & { points: number }) | null
  seasonRounds: number | null
}

/**
 * Who passed whom in the season table because of this round. Only the pairs that
 * actually swapped order, biggest climbers first, at most `limit`.
 */
export function overtakes(before: { userId: string; rank: number }[], after: { userId: string; rank: number }[], limit = 3): { who: string; passed: string }[] {
  const was = new Map(before.map((r) => [r.userId, r.rank]))
  const now = new Map(after.map((r) => [r.userId, r.rank]))
  const found: { who: string; passed: string; gap: number }[] = []
  for (const [a, rankA] of now) {
    for (const [b, rankB] of now) {
      if (a === b) continue
      const [oldA, oldB] = [was.get(a), was.get(b)]
      if (oldA === undefined || oldB === undefined) continue
      if (oldA > oldB && rankA < rankB) found.push({ who: a, passed: b, gap: oldA - rankA })
    }
  }
  return found.sort((x, y) => y.gap - x.gap || x.who.localeCompare(y.who)).slice(0, limit).map(({ who, passed }) => ({ who, passed }))
}

/** The best and worst decisions of the round (highest and lowest return). Null with fewer than one decision. */
export function extremeDecisions(decisions: Decision[]): { best: Decision | null; worst: Decision | null } {
  if (decisions.length === 0) return { best: null, worst: null }
  const sorted = [...decisions].sort((a, b) => b.percent - a.percent || a.ticker.localeCompare(b.ticker))
  const best = sorted[0]!
  const worst = sorted.at(-1)!
  // A lone decision is the best or the worst, not both; a round of all-gains has no "worst".
  return { best: best.percent > 0 ? best : null, worst: worst.percent < 0 ? worst : null }
}

const sign = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(visibleReturn(v)).toFixed(2)}%`
export const formatSigned = sign

export function buildRecap(input: {
  roundNumber: number
  mode: SeasonMode
  people: Map<string, Person>
  results: { userId: string; percent: number; rank: number; points: number }[]
  before: { userId: string; rank: number }[]
  after: SeasonRow[]
  decisions: Decision[]
  seasonRounds: number | null
}): RoundRecap {
  const person = (id: string): Person => input.people.get(id) ?? { userId: id, name: "Player", handle: null }
  const table = [...input.results].sort((a, b) => a.rank - b.rank || b.percent - a.percent).map((r) => ({ ...person(r.userId), rank: r.rank, percent: r.percent, points: r.points }))
  const winners = table.filter((r) => r.rank === 1).map((r) => ({ ...person(r.userId), percent: r.percent }))
  const last = table.length > 1 ? table[table.length - 1]! : null
  // A loser is only named when the bottom of the table is clearly below the top.
  const loser = last && last.rank !== 1 ? { userId: last.userId, name: last.name, handle: last.handle, percent: last.percent } : null
  const { best, worst } = extremeDecisions(input.decisions)
  const leaderRow = input.after[0]
  const headline =
    winners.length === 0
      ? `Round ${input.roundNumber} is in`
      : winners.length === 1
        ? `${winners[0]!.name} takes Round ${input.roundNumber} with ${sign(winners[0]!.percent)}`
        : `${winners.map((w) => w.name).join(" and ")} share Round ${input.roundNumber} at ${sign(winners[0]!.percent)}`
  return {
    roundNumber: input.roundNumber,
    mode: input.mode,
    headline,
    winners,
    loser,
    table,
    overtakes: overtakes(input.before, input.after).map((o) => ({ who: person(o.who), passed: person(o.passed) })),
    bestDecision: best ? { ...person(best.userId), ...best } : null,
    worstDecision: worst ? { ...person(worst.userId), ...worst } : null,
    leader: leaderRow ? { ...person(leaderRow.userId), points: leaderRow.points } : null,
    seasonRounds: input.seasonRounds,
  }
}

/* ------------------------------------------------------------------ *
 * Notes
 * ------------------------------------------------------------------ */

export const NOTE_MAX = 280

/** A note or reply, trimmed and tidied; null when there is nothing in it. */
export function cleanNote(text: unknown): string | null {
  if (typeof text !== "string") return null
  const tidy = text.replace(/\s+/g, " ").trim()
  if (!tidy) return null
  return tidy.slice(0, NOTE_MAX)
}
