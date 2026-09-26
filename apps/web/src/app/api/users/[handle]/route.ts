import { NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db, follows, users } from "@web/db"
import { ApiError, withPublic } from "@web/lib/api"
import { getCurrentUserId } from "@web/lib/auth"
import { isRange, loadSnapshots, rangeStart, returnsByRange, timeWeightedReturn, type Range } from "@web/lib/returns"
import { loadSharedHoldings } from "@web/lib/social"

type Ctx = { params: Promise<{ handle: string }> }

/**
 * A public trader profile. Returns and portfolio weights only.
 *
 * Non-public profiles 404 rather than 403 so the endpoint can't be used to
 * enumerate which handles exist.
 */
export const GET = withPublic<Ctx>(async (request, { params }) => {
  const { handle } = await params

  const user = await db.query.users.findFirst({ where: eq(users.handle, handle.toLowerCase()) })
  if (!user || !user.isPublic) throw new ApiError("Profile not found", 404)

  const viewerId = await getCurrentUserId()
  const rangeParam = new URL(request.url).searchParams.get("range") ?? "3M"
  const range: Range = isRange(rangeParam) ? rangeParam : "3M"

  // Load the full history once; every window is a slice of the same rows.
  const [allPoints, holdingsByUser, followerRows, isFollowing] = await Promise.all([
    loadSnapshots([user.id], "ALL").then((m) => m.get(user.id) ?? []),
    loadSharedHoldings([user.id], 10),
    db.select({ count: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followingId, user.id)),
    viewerId
      ? db.query.follows.findFirst({
          where: and(eq(follows.followerId, viewerId), eq(follows.followingId, user.id)),
        })
      : Promise.resolve(undefined),
  ])

  const windowStart = rangeStart(range)
  const summary = timeWeightedReturn(windowStart ? allPoints.filter((p) => p.date >= windowStart) : allPoints)
  const byRange = returnsByRange(allPoints)

  return NextResponse.json({
    profile: {
      handle: user.handle,
      name: user.name,
      image: user.image,
      bio: user.bio,
      joinedAt: user.createdAt,
      followers: followerRows[0]?.count ?? 0,
      isFollowing: !!isFollowing,
      isYou: viewerId === user.id,
    },
    range,
    performance: {
      percent: summary.percent,
      days: summary.days,
      series: summary.series.map((p) => ({ date: p.date, indexed: p.indexed })),
      byRange,
    },
    holdings: holdingsByUser.get(user.id) ?? [],
  })
})
