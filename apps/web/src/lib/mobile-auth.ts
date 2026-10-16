import { and, eq, isNull } from "drizzle-orm"
import { authIdentities, db, mobileRefreshTokens, users } from "@web/db"
import { ApiError } from "@web/lib/api"
import { upsertUser } from "@web/lib/auth"
import { decrypt, encrypt } from "@web/lib/crypto"
import { appleRevokeConfig, exchangeAuthorizationCode, revokeRefreshToken as revokeAppleRefreshToken, type FetchLike } from "@web/lib/apple-revoke-core"
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

/** Real `fetch`, narrowed to what the Apple helpers use. */
const appleFetch: FetchLike = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })

/**
 * Keeps Apple's refresh token (encrypted) for an identity so account deletion can revoke it later.
 * Best effort: a missing config or a refused code only means there is nothing to revoke on deletion.
 */
export async function rememberAppleToken(userId: string, subject: string, authorizationCode: string) {
  const config = appleRevokeConfig()
  if (!config) return
  try {
    const token = await exchangeAuthorizationCode(config, authorizationCode, appleFetch)
    if (!token) return
    await db
      .update(authIdentities)
      .set({ providerRefreshToken: encrypt(token) })
      .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, "apple"), eq(authIdentities.subject, subject)))
  } catch (error) {
    console.error("[mobile] could not store Apple token", error instanceof Error ? error.message : error)
  }
}

/** Revokes every stored Apple token for the user. Never throws: deletion must not be blocked by Apple being unreachable. */
export async function revokeAppleTokens(userId: string) {
  const config = appleRevokeConfig()
  if (!config) return
  try {
    const rows = await db.select().from(authIdentities).where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, "apple")))
    for (const row of rows) {
      if (!row.providerRefreshToken) continue
      const revoked = await revokeAppleRefreshToken(config, decrypt(row.providerRefreshToken), appleFetch)
      if (!revoked) console.error("[mobile] Apple refused token revocation", { identityId: row.id })
    }
  } catch (error) {
    console.error("[mobile] Apple revocation failed", error instanceof Error ? error.message : error)
  }
}
