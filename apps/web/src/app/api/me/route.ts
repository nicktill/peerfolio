import { NextResponse } from "next/server"
import { and, eq, ne, sql } from "drizzle-orm"
import { z } from "zod"
import { db, follows, portfolioSnapshots, users } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"

export const GET = withUser<unknown>(async (userId) => {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new ApiError("User not found", 404)

  const [[snapshotCount], [followerCount]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.userId, userId)),
    db.select({ count: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followingId, userId)),
  ])

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      handle: user.handle,
      bio: user.bio,
      isPublic: user.isPublic,
    },
    stats: { snapshotDays: snapshotCount?.count ?? 0, followers: followerCount?.count ?? 0 },
  })
})

const UpdateMe = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Handle must be at least 3 characters")
    .max(20, "Handle must be 20 characters or fewer")
    .regex(/^[a-z0-9_]+$/, "Handles can use letters, numbers and underscores only")
    .optional(),
  bio: z.string().trim().max(160).nullable().optional(),
  isPublic: z.boolean().optional(),
})

export const PATCH = withUser<unknown>(async (userId, request) => {
  const parsed = UpdateMe.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid profile")

  const updates = parsed.data

  if (updates.handle) {
    const taken = await db.query.users.findFirst({
      where: and(eq(users.handle, updates.handle), ne(users.id, userId)),
    })
    if (taken) throw new ApiError("That handle is taken", 409)
  }

  // Going public without a handle would produce an unreachable profile URL.
  if (updates.isPublic) {
    const current = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!updates.handle && !current?.handle) throw new ApiError("Choose a handle before going public")
  }

  await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, userId))

  return NextResponse.json({ ok: true })
})
