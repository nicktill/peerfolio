import { NextResponse } from "next/server"
import { and, asc, eq, ne, sql } from "drizzle-orm"
import { z } from "zod"
import { db, follows, leagueMembers, leagues, plaidItems, portfolioSnapshots, users, waitlistSignups } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, plaidErrorCode } from "@web/lib/plaid"

export const maxDuration = 120

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

/**
 * Deletes the account and everything attached to it.
 *
 * Plaid connections are revoked with `/item/remove` first, so no access token
 * outlives the account. Everything else goes by cascade from the users row.
 */
export const DELETE = withUser<unknown>(async (userId) => {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new ApiError("User not found", 404)

  await db.transaction(async (tx) => {
    // Serialize with Link exchange/sync so a new remote Item cannot appear mid-delete.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    const items = await tx.select().from(plaidItems).where(eq(plaidItems.userId, userId))
    for (const item of items) {
      try {
        await getPlaidClient().itemRemove({ access_token: decrypt(item.accessToken) })
      } catch (error) {
        const code = plaidErrorCode(error)
        if (code !== "INVALID_ACCESS_TOKEN" && code !== "ITEM_NOT_FOUND") {
          console.error("[me] remote cleanup failed", { itemId: item.id, userId, code })
          throw new ApiError("Could not disconnect your brokerages from Plaid. Your account was preserved; please retry deletion shortly.", 502)
        }
      }
    }

    // Leagues outlive their creator: hand each one to the longest-standing
    // remaining member. A league with nobody else in it goes with the account.
    const owned = await tx.select({ id: leagues.id }).from(leagues).where(eq(leagues.ownerId, userId))
    for (const league of owned) {
      const [heir] = await tx
        .select()
        .from(leagueMembers)
        .where(and(eq(leagueMembers.leagueId, league.id), ne(leagueMembers.userId, userId)))
        .orderBy(asc(leagueMembers.joinedAt))
        .limit(1)
      if (!heir) continue

      await tx.update(leagues).set({ ownerId: heir.userId }).where(eq(leagues.id, league.id))
      await tx.update(leagueMembers).set({ role: "owner" }).where(eq(leagueMembers.id, heir.id))
    }

    await tx.delete(waitlistSignups).where(eq(waitlistSignups.email, user.email))
    await tx.delete(users).where(eq(users.id, userId))
  })

  return NextResponse.json({ ok: true })
})
