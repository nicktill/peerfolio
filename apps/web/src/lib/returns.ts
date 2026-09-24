import { and, asc, gte, inArray } from "drizzle-orm"
import "server-only"
import { db, portfolioSnapshots } from "@web/db"
import { rangeStart, sparkline, timeWeightedReturn, type Range, type ReturnSummary, type SnapshotPoint } from "@web/lib/ranges"

export * from "@web/lib/ranges"

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
