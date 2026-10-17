import "server-only"
import { createHash } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { db, productionLinkAttempts, users } from "@web/db"
import { ApiError } from "@web/lib/api"
import { plaidLinkingEnabled } from "@web/lib/plaid"
import { plaidEnvironment } from "@web/lib/plaid-config"
import { brokerageBlock, isAdminEmail, productionBudgetSettings, USER_LINK_LIMIT_NOTICE, USER_PRODUCTION_LINK_LIMIT } from "@web/lib/plaid-access-core"
import { plaidPaused } from "@web/lib/plaid-switch"

type Store = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function assertAdmin(userId: string, store: Store = db) {
  const user = await store.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user || !isAdminEmail(user.email, process.env.ADMIN_EMAILS)) throw new ApiError("Administrator access required", 403)
  return user
}

export async function assertBrokeragePermission(userId: string, store: Store = db) {
  const user = await store.query.users.findFirst({ where: eq(users.id, userId) })
  // Open to every signed-in user; only an explicit admin block (or a missing user) refuses.
  if (!user || user.brokerageLinkingBlocked) throw new ApiError("Brokerage linking has been disabled for your account", 403, { code: "BROKERAGE_LINKING_DISABLED" })
  return user
}

/** Lifetime attempts by this user that created or may have created an Item. Disconnects never reduce it. */
export async function userLinkAttempts(userId: string, store: Store = db) {
  const [row] = await store.select({ n: sql<number>`count(*)::int` }).from(productionLinkAttempts).where(eq(productionLinkAttempts.userId, userId))
  return Number(row?.n ?? 0)
}

export async function productionCapacity(store: Store = db) {
  const { limit, previouslyUsed } = productionBudgetSettings(process.env)
  const [counts] = await store.select({
    used: sql<number>`count(*)::int`,
    reserved: sql<number>`count(*) filter (where ${productionLinkAttempts.status} = 'reserved')::int`,
    uncertain: sql<number>`count(*) filter (where ${productionLinkAttempts.status} = 'uncertain')::int`,
  }).from(productionLinkAttempts)
  const attempts = Number(counts?.used ?? 0)
  const used = attempts + previouslyUsed
  return { limit, used, reserved: Number(counts?.reserved ?? 0), uncertain: Number(counts?.uncertain ?? 0), available: Math.max(0, limit - used), previouslyUsed, attempts }
}

export async function getBrokerageAccess(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new ApiError("User not found", 404)
  const capacity = await productionCapacity()
  const production = plaidEnvironment(process.env.PLAID_ENV) === "production"
  const enabled = plaidLinkingEnabled()
  const paused = await plaidPaused()
  const userAttempts = production ? await userLinkAttempts(userId) : 0
  const blocked = brokerageBlock({ paused, userBlocked: user.brokerageLinkingBlocked, configured: enabled, production, userAttempts, poolAvailable: capacity.available })
  const admin = isAdminEmail(user.email, process.env.ADMIN_EMAILS)
  // `code` lets the button say why it's unavailable. The reason text and the budget are for the owner only.
  const userLimit = { used: userAttempts, limit: USER_PRODUCTION_LINK_LIMIT, remaining: Math.max(0, USER_PRODUCTION_LINK_LIMIT - userAttempts) }
  return { allowed: !blocked, admin, code: blocked?.code, userLimit, notice: USER_LINK_LIMIT_NOTICE, ...(admin ? { capacity, reason: blocked?.reason } : {}) }
}

export async function assertBrokerageLinkingAllowed(userId: string) {
  const access = await getBrokerageAccess(userId)
  if (!access.allowed) {
    if (access.code === "user_limit") throw new ApiError(USER_LINK_LIMIT_NOTICE, 403, { code: "USER_ITEM_LIMIT_REACHED" })
    if (access.code === "full") throw new ApiError("Production connection limit reached", 403, { code: "PRODUCTION_ITEM_LIMIT_REACHED" })
    throw new ApiError(("reason" in access && access.reason) || "Brokerage linking unavailable", 403)
  }
}

/** Commit before calling Plaid: rollback/timeout cannot replenish the lifetime budget. */
export async function reserveProductionLinkAttempt(userId: string, publicToken: string): Promise<string | null> {
  if (!plaidLinkingEnabled()) throw new ApiError("Brokerage linking is not configured", 503)
  if (plaidEnvironment(process.env.PLAID_ENV) !== "production") {
    await assertBrokeragePermission(userId)
    return null
  }
  return db.transaction(async (store) => {
    await store.execute(sql`set local lock_timeout = '10s'`)
    // Reservation takes the global quota lock, then the user's permission lock.
    await store.execute(sql`select pg_advisory_xact_lock(hashtext('peerfolio-production-link-budget'))`)
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    await assertBrokeragePermission(userId, store)
    const digest = createHash("sha256").update(publicToken).digest("hex")
    const prior = await store.query.productionLinkAttempts.findFirst({ where: eq(productionLinkAttempts.publicTokenDigest, digest) })
    if (prior) throw new ApiError("This connection attempt was already processed. Start a new connection to retry.", 409, { code: "LINK_ATTEMPT_ALREADY_RESERVED" })
    const capacity = await productionCapacity(store)
    // Same transaction and locks as the insert: two simultaneous reservations at the cap cannot both pass.
    if ((await userLinkAttempts(userId, store)) >= USER_PRODUCTION_LINK_LIMIT) throw new ApiError(USER_LINK_LIMIT_NOTICE, 403, { code: "USER_ITEM_LIMIT_REACHED" })
    if (capacity.available === 0) throw new ApiError("Production connection limit reached", 403, { code: "PRODUCTION_ITEM_LIMIT_REACHED" })
    const [attempt] = await store.insert(productionLinkAttempts).values({ userId, publicTokenDigest: digest }).returning({ id: productionLinkAttempts.id })
    return attempt!.id
  })
}

export async function finishProductionLinkAttempt(attemptId: string | null, status: "succeeded" | "uncertain", plaidItemId?: string) {
  if (!attemptId) return
  await db.update(productionLinkAttempts).set({ status, plaidItemId: plaidItemId ?? null, completedAt: new Date() }).where(eq(productionLinkAttempts.id, attemptId))
}
