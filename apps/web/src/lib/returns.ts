import { and, asc, gte, inArray } from "drizzle-orm"
import { db, portfolioSnapshots } from "@web/db"

export const RANGES = ["1W", "1M", "3M", "6M", "1Y", "ALL"] as const
export type Range = (typeof RANGES)[number]

export const isRange = (v: string): v is Range => (RANGES as readonly string[]).includes(v)

const DAYS: Record<Exclude<Range, "ALL">, number> = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }

/** Inclusive start date for a range, or null for ALL. */
export function rangeStart(range: Range, from = new Date()): string | null {
  if (range === "ALL") return null
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() - DAYS[range])
  return d.toISOString().slice(0, 10)
}

export type SnapshotPoint = {
  date: string
  netWorth: number
  investableAssets: number
  netFlows: number
}

export type ReturnSeriesPoint = { date: string; value: number; indexed: number }

export type ReturnSummary = {
  /** Time-weighted return over the window, as a percentage. */
  percent: number
  /** Growth of 100 units, for charting members on one axis. */
  series: ReturnSeriesPoint[]
  /** Snapshot days available — the honest denominator for "is this real yet". */
  days: number
  startValue: number
  endValue: number
}

const EMPTY: ReturnSummary = { percent: 0, series: [], days: 0, startValue: 0, endValue: 0 }

/**
 * Chain-linked time-weighted return.
 *
 * Each period's return divides out the cash that moved in or out, so adding
 * money neither helps nor hurts your score. This is the whole reason a
 * leaderboard here means something: it ranks decisions, not deposits.
 *
 *   r_t = (V_t - F_t) / V_{t-1} - 1
 *   TWR = Π(1 + r_t) - 1
 *
 * Periods opening at a non-positive value are skipped rather than treated as
 * infinite return.
 */
export function timeWeightedReturn(
  points: SnapshotPoint[],
  basis: "investableAssets" | "netWorth" = "investableAssets",
): ReturnSummary {
  if (points.length < 2) {
    const only = points[0]
    if (!only) return EMPTY
    const v = only[basis]
    return { percent: 0, series: [{ date: only.date, value: v, indexed: 100 }], days: 1, startValue: v, endValue: v }
  }

  const series: ReturnSeriesPoint[] = []
  let cumulative = 1

  const first = points[0]!
  series.push({ date: first.date, value: first[basis], indexed: 100 })

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    const opening = prev[basis]

    if (opening > 0) {
      const periodReturn = (curr[basis] - curr.netFlows) / opening - 1
      // Clamp per-period moves to ±100%: a mis-signed flow or a mid-window
      // account disconnect should not detonate the whole chain.
      cumulative *= 1 + Math.max(-1, Math.min(1, periodReturn))
    }

    series.push({ date: curr.date, value: curr[basis], indexed: cumulative * 100 })
  }

  const last = points[points.length - 1]!
  return {
    percent: (cumulative - 1) * 100,
    series,
    days: points.length,
    startValue: first[basis],
    endValue: last[basis],
  }
}

const n = (v: string | null) => (v == null ? 0 : Number(v))

/** Loads snapshots for several users at once, ordered oldest-first per user. */
export async function loadSnapshots(userIds: string[], range: Range): Promise<Map<string, SnapshotPoint[]>> {
  const byUser = new Map<string, SnapshotPoint[]>()
  if (userIds.length === 0) return byUser

  const start = rangeStart(range)
  const filters = [inArray(portfolioSnapshots.userId, userIds)]
  if (start) filters.push(gte(portfolioSnapshots.date, start))

  const rows = await db
    .select()
    .from(portfolioSnapshots)
    .where(and(...filters))
    .orderBy(asc(portfolioSnapshots.date))

  for (const row of rows) {
    const list = byUser.get(row.userId) ?? []
    list.push({
      date: row.date,
      netWorth: n(row.netWorth),
      investableAssets: n(row.investableAssets),
      netFlows: n(row.netFlows),
    })
    byUser.set(row.userId, list)
  }

  return byUser
}

export async function computeReturns(
  userId: string,
  range: Range,
  basis: "investableAssets" | "netWorth" = "investableAssets",
): Promise<ReturnSummary> {
  const byUser = await loadSnapshots([userId], range)
  return timeWeightedReturn(byUser.get(userId) ?? [], basis)
}

export type StandingInput = { userId: string; name: string | null; handle: string | null; image: string | null }

export type Standing = StandingInput & {
  rank: number
  percent: number
  days: number
  /** Indexed series, downsampled for sparklines. */
  spark: number[]
  /** False until there are at least two snapshot days to compare. */
  hasHistory: boolean
}

/** Downsamples an indexed series to at most `max` points, always keeping the ends. */
function sparkline(series: ReturnSeriesPoint[], max = 24): number[] {
  if (series.length <= max) return series.map((p) => p.indexed)

  const step = (series.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => series[Math.round(i * step)]!.indexed)
}

/**
 * Ranks a set of users by time-weighted return. Used for both a league table
 * and the public board — the only difference is which user ids come in.
 */
export async function buildStandings(members: StandingInput[], range: Range): Promise<Standing[]> {
  const byUser = await loadSnapshots(
    members.map((m) => m.userId),
    range,
  )

  const scored = members.map((member) => {
    const summary = timeWeightedReturn(byUser.get(member.userId) ?? [])
    return {
      ...member,
      rank: 0,
      percent: summary.percent,
      days: summary.days,
      spark: sparkline(summary.series),
      hasHistory: summary.days >= 2,
    }
  })

  // Members without history sort last regardless of their placeholder 0%.
  scored.sort((a, b) => {
    if (a.hasHistory !== b.hasHistory) return a.hasHistory ? -1 : 1
    return b.percent - a.percent
  })

  scored.forEach((s, i) => {
    s.rank = i + 1
  })

  return scored
}
