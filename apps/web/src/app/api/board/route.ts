import { NextResponse } from "next/server"
import { and, eq, gte, sql } from "drizzle-orm"
import { db, follows, portfolioSnapshots, users } from "@web/db"
import { withPublic } from "@web/lib/api"
import { getCurrentUserId } from "@web/lib/auth"
import { buildStandings, isRange, rangeStart, type Range } from "@web/lib/returns"
import { loadSharedHoldings } from "@web/lib/social"

/**
 * Days of history required to appear on the public board.
 *
 * Without a floor, whoever connected yesterday and caught one good session
 * would outrank someone with a year of compounding. A leaderboard is only
 * worth reading if placing on it takes time.
 */
const MIN_HISTORY_DAYS = 7

/**
 * The public board: everyone who opted in, ranked by verified time-weighted
 * return. Percentages and portfolio weights only — no balances, ever.
 */
export const GET = withPublic<unknown>(async (request) => {
  const url = new URL(request.url)
  const rangeParam = url.searchParams.get("range") ?? "1M"
  const range: Range = isRange(rangeParam) ? rangeParam : "1M"
  const scope = url.searchParams.get("scope") === "following" ? "following" : "all"

  const viewerId = await getCurrentUserId()

  // Opted in, Plaid-verified on every day, and with enough history *inside the
  // window being ranked* — a year-old account that stopped syncing shouldn't
  // rank on a 1M board. Every day, not most: the ranking reads every snapshot
  // in the window, so a single day that included a manual account would let
  // self-reported numbers into a public rank. Bounding by date also keeps this
  // off a full scan of a table that grows by one row per user per day.
  const eligibleFrom = rangeStart(range)

  const eligible = await db
    .select({
      userId: users.id,
      name: users.name,
      handle: users.handle,
      image: users.image,
      bio: users.bio,
      days: sql<number>`count(${portfolioSnapshots.id})::int`,
    })
    .from(users)
    .innerJoin(portfolioSnapshots, eq(portfolioSnapshots.userId, users.id))
    .where(
      and(
        eq(users.isPublic, true),
        ...(eligibleFrom ? [gte(portfolioSnapshots.date, eligibleFrom)] : []),
      ),
    )
    .groupBy(users.id)
    .having(
      and(sql`count(${portfolioSnapshots.id}) >= ${MIN_HISTORY_DAYS}`, sql`bool_and(${portfolioSnapshots.isVerified})`),
    )

  let candidates = eligible
  let followingIds = new Set<string>()

  if (viewerId) {
    const rows = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, viewerId))
    followingIds = new Set(rows.map((r) => r.followingId))

    if (scope === "following") {
      candidates = eligible.filter((c) => followingIds.has(c.userId))
    }
  }

  const standings = await buildStandings(candidates, range)
  const holdingsByUser = await loadSharedHoldings(standings.slice(0, 50).map((s) => s.userId))

  const bioByUser = new Map(candidates.map((c) => [c.userId, c.bio]))

  return NextResponse.json({
    range,
    scope,
    minHistoryDays: MIN_HISTORY_DAYS,
    /** Stated in the UI so the ranking rules are never a mystery. */
    requiresVerified: true,
    traders: standings.slice(0, 50).map((s) => ({
      handle: s.handle,
      name: s.name,
      image: s.image,
      bio: bioByUser.get(s.userId) ?? null,
      rank: s.rank,
      percent: s.percent,
      days: s.days,
      spark: s.spark,
      holdings: holdingsByUser.get(s.userId) ?? [],
      isFollowing: followingIds.has(s.userId),
      isYou: s.userId === viewerId,
    })),
  })
})
