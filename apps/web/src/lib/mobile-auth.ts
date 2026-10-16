import { and, eq, isNull } from "drizzle-orm"
import { authIdentities, db, mobileRefreshTokens, users } from "@web/db"
import { ApiError } from "@web/lib/api"
import { upsertUser } from "@web/lib/auth"
import type { RefreshStore, VerifiedIdentity } from "@web/lib/mobile-auth-core"

/** Refresh-token storage backed by `mobile_refresh_tokens`. */
export const refreshStore: RefreshStore = {
  async insert(record) {
    await db.insert(mobileRefreshTokens).values(record)
  },
  async findByHash(tokenHash) {
    const row = await db.query.mobileRefreshTokens.findFirst({ where: eq(mobileRefreshTokens.tokenHash, tokenHash) })
    return row ?? null
  },
  async markUsed(id, at) {
    // The `usedAt IS NULL` guard makes this a compare-and-set: of two concurrent refreshes only one wins.
    const rows = await db
      .update(mobileRefreshTokens)
      .set({ usedAt: at })
      .where(and(eq(mobileRefreshTokens.id, id), isNull(mobileRefreshTokens.usedAt), isNull(mobileRefreshTokens.revokedAt)))
      .returning({ id: mobileRefreshTokens.id })
    return rows.length === 1
  },
  async revokeFamily(familyId, at) {
    await db
      .update(mobileRefreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(mobileRefreshTokens.familyId, familyId), isNull(mobileRefreshTokens.revokedAt)))
  },
}

/**
 * Finds or creates the user for a verified provider identity.
 *
 * A known (provider, subject) wins, which keeps Apple working after it stops sending the email. Otherwise a verified
 * email links to the existing account with that address (same person who signed in with Google on the web) or creates one.
 */
export async function resolveUserForIdentity(identity: VerifiedIdentity, fullName?: string | null): Promise<string> {
  const linked = await db.query.authIdentities.findFirst({
    where: and(eq(authIdentities.provider, identity.provider), eq(authIdentities.subject, identity.subject)),
  })
  if (linked) return linked.userId

  if (!identity.email || !identity.emailVerified) throw new ApiError("We couldn't get a verified email from that sign-in.", 422)

  const userId = await upsertUser({ email: identity.email, name: identity.name ?? fullName ?? null, image: identity.image })
  await db.insert(authIdentities).values({ userId, provider: identity.provider, subject: identity.subject }).onConflictDoNothing()
  return userId
}

export async function publicUser(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new ApiError("User not found", 404)
  return { id: user.id, email: user.email, name: user.name, image: user.image, handle: user.handle }
}
