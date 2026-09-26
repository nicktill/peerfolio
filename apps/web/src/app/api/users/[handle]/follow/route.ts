import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db, follows, users } from "@web/db"
import { ApiError, withUser } from "@web/lib/api"

type Ctx = { params: Promise<{ handle: string }> }

async function resolveTarget(handle: string, viewerId: string) {
  const target = await db.query.users.findFirst({ where: eq(users.handle, handle.toLowerCase()) })
  if (!target || !target.isPublic) throw new ApiError("Profile not found", 404)
  if (target.id === viewerId) throw new ApiError("You can't follow yourself")
  return target
}

export const POST = withUser<Ctx>(async (userId, _request, { params }) => {
  const { handle } = await params
  const target = await resolveTarget(handle, userId)

  await db.insert(follows).values({ followerId: userId, followingId: target.id }).onConflictDoNothing()

  return NextResponse.json({ isFollowing: true })
})

export const DELETE = withUser<Ctx>(async (userId, _request, { params }) => {
  const { handle } = await params
  const target = await resolveTarget(handle, userId)

  await db.delete(follows).where(and(eq(follows.followerId, userId), eq(follows.followingId, target.id)))

  return NextResponse.json({ isFollowing: false })
})
