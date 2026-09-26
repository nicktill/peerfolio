import { and, asc, gte, inArray } from "drizzle-orm"
import "server-only"
import { db, portfolioSnapshots } from "@web/db"
import { rangeStart, timeWeightedReturn, type Range, type ReturnSummary, type SnapshotPoint } from "@web/lib/ranges"

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
