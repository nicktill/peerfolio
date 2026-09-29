import { and, asc, eq, gte, inArray } from "drizzle-orm"
import "server-only"
import { accounts, db, portfolioSnapshots } from "@web/db"
import { rangeStart, sparkline, timeWeightedReturn, withLivePoint, type Range, type ReturnSummary, type SnapshotPoint } from "@web/lib/ranges"

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
      isVerified: row.isVerified,
    })
    byUser.set(row.userId, list)
  }

  return byUser
}

const LIABILITY = new Set(["credit", "loan"])

/**
 * Each user's balances right now, in the same terms as a nightly snapshot
 * (investable assets, net worth, verified), so a standing can end on today's
 * value instead of last night's. Matches what `writeDailySnapshot` would record.
 */
export async function loadLivePoints(userIds: string[]): Promise<Map<string, Pick<SnapshotPoint, "netWorth" | "investableAssets" | "isVerified">>> {
  const out = new Map<string, Pick<SnapshotPoint, "netWorth" | "investableAssets" | "isVerified">>()
  if (userIds.length === 0) return out

  const rows = await db
    .select({ userId: accounts.userId, category: accounts.category, source: accounts.source, balance: accounts.currentBalance })
    .from(accounts)
    .where(and(inArray(accounts.userId, userIds), eq(accounts.isActive, true)))

  const acc = new Map<string, { assets: number; liabilities: number; investable: number; sawManual: boolean; count: number }>()
  for (const r of rows) {
    const a = acc.get(r.userId) ?? { assets: 0, liabilities: 0, investable: 0, sawManual: false, count: 0 }
    const balance = Math.abs(n(r.balance))
    a.count++
    if (r.source === "manual") a.sawManual = true
    if (LIABILITY.has(r.category)) a.liabilities += balance
    else {
      a.assets += balance
      if (r.category === "investment") a.investable += balance
    }
    acc.set(r.userId, a)
  }

  for (const [userId, a] of acc) {
    out.set(userId, { netWorth: a.assets - a.liabilities, investableAssets: a.investable, isVerified: a.count > 0 && !a.sawManual })
  }
  return out
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
  /** Every day behind this number came from a linked institution. */
  isVerified: boolean
}

/**
 * Ranks a set of users by time-weighted return. Used for both a league table
 * and the public board — the only difference is which user ids come in.
 */
export async function buildStandings(members: StandingInput[], range: Range): Promise<Standing[]> {
  const ids = members.map((m) => m.userId)
  const [byUser, live] = await Promise.all([loadSnapshots(ids, range), loadLivePoints(ids)])
  const today = new Date().toISOString().slice(0, 10)

  const scored = members.map((member) => {
    // End on today's live value, like the dashboard and fantasy do.
    const stored = byUser.get(member.userId) ?? []
    const liveNow = live.get(member.userId)
    const points = liveNow ? withLivePoint(stored, liveNow, today) : stored
    const summary = timeWeightedReturn(points)
    return {
      ...member,
      rank: 0,
      percent: summary.percent,
      days: summary.days,
      spark: sparkline(summary.series),
      hasHistory: summary.days >= 2,
      isVerified: points.length > 0 && points.every((p) => p.isVerified),
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
