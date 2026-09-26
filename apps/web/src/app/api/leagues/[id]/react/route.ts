import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, leagueMembers, reactions } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { isReactionEmoji, requireMembership } from "@web/lib/social"

type Ctx = { params: Promise<{ id: string }> }

/** Toggles a reaction on another member's standing. */
export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  await requireMembership(userId, id)

  const { toUserId, emoji } = await readJson<{ toUserId?: string; emoji?: string }>(request)
  if (!toUserId || !emoji) throw new ApiError("toUserId and emoji are required")
  if (!isReactionEmoji(emoji)) throw new ApiError("Unsupported reaction")
  if (toUserId === userId) throw new ApiError("You can't react to yourself")

  const target = await db.query.leagueMembers.findFirst({
    where: and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, toUserId)),
  })
  if (!target) throw new ApiError("That person isn't in this league", 404)

  const existing = await db.query.reactions.findFirst({
    where: and(
      eq(reactions.leagueId, id),
      eq(reactions.fromUserId, userId),
      eq(reactions.toUserId, toUserId),
      eq(reactions.emoji, emoji),
    ),
  })

  if (existing) {
    await db.delete(reactions).where(eq(reactions.id, existing.id))
    return NextResponse.json({ active: false })
  }

  await db.insert(reactions).values({ leagueId: id, fromUserId: userId, toUserId, emoji })
  return NextResponse.json({ active: true })
})
