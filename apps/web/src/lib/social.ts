import { isCusip } from "@web/lib/import-parse"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db, holdings, leagueMembers, leagues, reactions, securities, users } from "@web/db"
import { ApiError } from "@web/lib/api"
import { buildStandings, type Range, type Standing } from "@web/lib/returns"

/** Tickers a member holds, shared without any position size attached. */
export type SharedHolding = { ticker: string; name: string | null; weight: number }

/**
 * Top tickers per user, as *weights within their own portfolio*.
 *
 * Deliberately relative: a weight says "this is 12% of what they hold", which
 * is the interesting part, while revealing nothing about how much money that
 * is. Dollar values never leave this function.
 */
export async function loadSharedHoldings(userIds: string[], limit = 5): Promise<Map<string, SharedHolding[]>> {
  const out = new Map<string, SharedHolding[]>()
  if (userIds.length === 0) return out

  const rows = await db
    .select({
      userId: holdings.userId,
      ticker: securities.tickerSymbol,
      name: securities.name,
      value: sql<number>`COALESCE(${holdings.institutionValue}, 0)::float8`,
    })
    .from(holdings)
    .innerJoin(securities, eq(holdings.securityId, securities.id))
    .where(inArray(holdings.userId, userIds))

  const byUser = new Map<string, { ticker: string; name: string | null; value: number }[]>()
  for (const row of rows) {
    // Funds known only by a code (401(k) trusts) have no ticker worth showing to a league.
    if (!row.ticker || isCusip(row.ticker) || row.value <= 0) continue
    const list = byUser.get(row.userId) ?? []
    list.push({ ticker: row.ticker, name: row.name, value: row.value })
    byUser.set(row.userId, list)
  }

  for (const [userId, list] of byUser) {
    const total = list.reduce((sum, h) => sum + h.value, 0)
    if (total <= 0) continue

    out.set(
      userId,
      list
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((h) => ({ ticker: h.ticker, name: h.name, weight: (h.value / total) * 100 })),
    )
  }

  return out
}

export type LeagueStanding = Standing & { shareHoldings: boolean; holdings: SharedHolding[]; reactions: Record<string, number>; isYou: boolean }

/** Asserts membership and returns the league row. */
export async function requireMembership(userId: string, leagueId: string) {
  const league = await db.query.leagues.findFirst({ where: eq(leagues.id, leagueId) })
  if (!league) throw new ApiError("League not found", 404)

  const membership = await db.query.leagueMembers.findFirst({
    where: and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)),
  })
  if (!membership) throw new ApiError("You are not a member of this league", 403)

  return { league, membership }
}

/** Full standings for a league: ranked returns, shared tickers, reaction counts. */
export async function buildLeagueStandings(leagueId: string, viewerId: string, range: Range): Promise<LeagueStanding[]> {
  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      handle: users.handle,
      image: users.image,
      shareHoldings: leagueMembers.shareHoldings,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, leagueId))

  const [standings, sharedHoldings, reactionRows] = await Promise.all([
    buildStandings(
      members.map((m) => ({ userId: m.userId, name: m.name, handle: m.handle, image: m.image })),
      range,
    ),
    loadSharedHoldings(members.filter((m) => m.shareHoldings).map((m) => m.userId)),
    db
      .select({ toUserId: reactions.toUserId, emoji: reactions.emoji, count: sql<number>`count(*)::int` })
      .from(reactions)
      .where(eq(reactions.leagueId, leagueId))
      .groupBy(reactions.toUserId, reactions.emoji),
  ])

  const shareFlag = new Map(members.map((m) => [m.userId, m.shareHoldings]))
  const reactionsByUser = new Map<string, Record<string, number>>()
  for (const row of reactionRows) {
    const bucket = reactionsByUser.get(row.toUserId) ?? {}
    bucket[row.emoji] = row.count
    reactionsByUser.set(row.toUserId, bucket)
  }

  return standings.map((standing) => ({
    ...standing,
    shareHoldings: shareFlag.get(standing.userId) ?? false,
    holdings: sharedHoldings.get(standing.userId) ?? [],
    reactions: reactionsByUser.get(standing.userId) ?? {},
    isYou: standing.userId === viewerId,
  }))
}

/** Leagues the user belongs to, with member counts. */
export async function listLeaguesForUser(userId: string) {
  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      description: leagues.description,
      emoji: leagues.emoji,
      accent: leagues.accent,
      inviteCode: leagues.inviteCode,
      ownerId: leagues.ownerId,
      createdAt: leagues.createdAt,
      role: leagueMembers.role,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(and(eq(leagueMembers.userId, userId), eq(leagues.isArchived, false)))
    .orderBy(desc(leagues.createdAt))

  if (rows.length === 0) return []

  const counts = await db
    .select({ leagueId: leagueMembers.leagueId, count: sql<number>`count(*)::int` })
    .from(leagueMembers)
    .where(
      inArray(
        leagueMembers.leagueId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(leagueMembers.leagueId)

  const countById = new Map(counts.map((c) => [c.leagueId, c.count]))
  return rows.map((row) => ({ ...row, memberCount: countById.get(row.id) ?? 1 }))
}

/** Emoji allowed as reactions. Fixed list — this is cheering, not a text field. */
export const REACTION_EMOJI = ["🔥", "🚀", "👏", "🧊", "🤝", "😤"] as const

export const isReactionEmoji = (v: string): v is (typeof REACTION_EMOJI)[number] =>
  (REACTION_EMOJI as readonly string[]).includes(v)
