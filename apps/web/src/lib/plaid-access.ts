import "server-only"
import { createHash } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { db, productionLinkAttempts, users } from "@web/db"
import { ApiError } from "@web/lib/api"
import { plaidLinkingEnabled } from "@web/lib/plaid"
import { plaidEnvironment } from "@web/lib/plaid-config"
import { isAdminEmail, productionBudgetSettings } from "@web/lib/plaid-access-core"
import { plaidPaused } from "@web/lib/plaid-switch"

type Store = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function assertAdmin(userId: string, store: Store = db) {
  const user = await store.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user || !isAdminEmail(user.email, process.env.ADMIN_EMAILS)) throw new ApiError("Administrator access required", 403)
  return user
}

export async function assertBrokeragePermission(userId: string, store: Store = db) {
  const user = await store.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user?.brokerageLinkingEnabled) throw new ApiError("Brokerage linking has not been enabled for your account", 403, { code: "BROKERAGE_LINKING_DISABLED" })
  return user
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
  const reason = paused ? "Brokerage connections are paused" : !user.brokerageLinkingEnabled ? "Brokerage linking has not been enabled for your account"
    : !enabled ? "Brokerage linking is not configured"
      : production && capacity.available === 0 ? "Production connection limit reached" : undefined
  return { allowed: !reason, admin: isAdminEmail(user.email, process.env.ADMIN_EMAILS), capacity, reason }
}

export async function assertBrokerageLinkingAllowed(userId: string) {
  const access = await getBrokerageAccess(userId)
  if (!access.allowed) throw new ApiError(access.reason ?? "Brokerage linking unavailable", 403)
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
    if (capacity.available === 0) throw new ApiError("Production connection limit reached", 403, { code: "PRODUCTION_ITEM_LIMIT_REACHED" })
    const [attempt] = await store.insert(productionLinkAttempts).values({ userId, publicTokenDigest: digest }).returning({ id: productionLinkAttempts.id })
    return attempt!.id
  })
}

export async function finishProductionLinkAttempt(attemptId: string | null, status: "succeeded" | "uncertain", plaidItemId?: string) {
  if (!attemptId) return
  await db.update(productionLinkAttempts).set({ status, plaidItemId: plaidItemId ?? null, completedAt: new Date() }).where(eq(productionLinkAttempts.id, attemptId))
}
