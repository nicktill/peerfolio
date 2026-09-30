import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, fantasyMembers, fantasyReactions } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { requireFantasyMember } from "@web/lib/fantasy"
import { isReactionEmoji } from "@web/lib/social"

type Ctx = { params: Promise<{ id: string }> }

/** Toggles a reaction on another member's fantasy standing. */
export const POST = withUser<Ctx>(async (userId, request, { params }) => {
  const { id } = await params
  const { member } = await requireFantasyMember(userId, id)
  const { toUserId, emoji } = await readJson<{ toUserId?: string; emoji?: string }>(request)

  if (!toUserId || !emoji) throw new ApiError("toUserId and emoji are required")
  if (!isReactionEmoji(emoji)) throw new ApiError("Unsupported reaction")
  if (toUserId === userId) throw new ApiError("You can't react to yourself")

  const target = await db.query.fantasyMembers.findFirst({
    where: and(eq(fantasyMembers.leagueId, id), eq(fantasyMembers.userId, toUserId)),
  })
  if (!target) throw new ApiError("That person isn't in this league", 404)

  const inserted = await db
    .insert(fantasyReactions)
    .values({ fromMemberId: member.id, toMemberId: target.id, emoji })
    .onConflictDoNothing()
    .returning({ id: fantasyReactions.id })

  if (inserted.length > 0) return NextResponse.json({ active: true })

  await db
    .delete(fantasyReactions)
    .where(
      and(
        eq(fantasyReactions.fromMemberId, member.id),
        eq(fantasyReactions.toMemberId, target.id),
        eq(fantasyReactions.emoji, emoji),
      ),
    )
  return NextResponse.json({ active: false })
})
