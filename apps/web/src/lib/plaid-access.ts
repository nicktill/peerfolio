import "server-only"
import { createHash } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { db, plaidItems, productionLinkAttempts, users } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { ApiError } from "@web/lib/api"
import { plaidLinkingEnabled } from "@web/lib/plaid"
import { plaidEnvironment } from "@web/lib/plaid-config"
import { brokerageBlock, choosePool, firstAvailablePool, isAdminEmail, poolBudgets, productionPoolsChecked, totalCapacity, effectiveUserLimit, userLimitNotice } from "@web/lib/plaid-access-core"
import { plaidPaused } from "@web/lib/plaid-switch"
import { decodePlaidToken, newPlaidProfile, trial2Configured, trial2Enabled, type PlaidProfile } from "@web/lib/plaid-profile"

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

let loggedPool2Error: string | null = null

/** Items whose stored profile is trial2 while its credentials are missing: they cannot sync or be removed until restored. */
export async function orphanedPool2Items(store: Store = db) {
  if (trial2Configured(process.env)) return 0
  const rows = await store.select({ id: plaidItems.id, accessToken: plaidItems.accessToken }).from(plaidItems)
  let count = 0
  for (const row of rows) {
    try { if (decodePlaidToken(decrypt(row.accessToken)).profile === "trial2") count++ } catch { /* unreadable tokens are not pool-2 Items */ }
  }
  return count
}

export async function productionCapacity(store: Store = db) {
  const { pools, pool2Error } = productionPoolsChecked(process.env, trial2Enabled(process.env))
  if (pool2Error && pool2Error !== loggedPool2Error) {
    loggedPool2Error = pool2Error
    console.error(JSON.stringify({ level: "error", event: "plaid.pool2_misconfigured", reason: pool2Error }))
  }
  const rows = await store.select({
    pool: productionLinkAttempts.pool,
    attempts: sql<number>`count(*)::int`,
    reserved: sql<number>`count(*) filter (where ${productionLinkAttempts.status} = 'reserved')::int`,
    uncertain: sql<number>`count(*) filter (where ${productionLinkAttempts.status} = 'uncertain')::int`,
  }).from(productionLinkAttempts).groupBy(productionLinkAttempts.pool)
  const ledger: Record<number, { attempts: number; reserved: number; uncertain: number }> = {}
  for (const row of rows) ledger[row.pool] = { attempts: Number(row.attempts), reserved: Number(row.reserved), uncertain: Number(row.uncertain) }
  const budgets = poolBudgets(pools, ledger)
  // Totals cover configured pools only; `pools` carries the per-pool breakdown for the admin view.
  return { ...totalCapacity(budgets), pools: budgets, pool2Error }
}

/** Pool a new Link session should be created from: the first with room. Read-only; the reservation re-checks under lock. */
export async function nextLinkPool(store: Store = db) {
  const capacity = await productionCapacity(store)
  return firstAvailablePool(capacity.pools)
}

export async function getBrokerageAccess(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new ApiError("User not found", 404)
  const capacity = await productionCapacity()
  const production = plaidEnvironment(process.env.PLAID_ENV) === "production"
  const enabled = plaidLinkingEnabled()
  const paused = await plaidPaused()
  const userAttempts = production ? await userLinkAttempts(userId) : 0
  const blocked = brokerageBlock({ paused, userBlocked: user.brokerageLinkingBlocked, configured: enabled, production, userAttempts, userLimit: effectiveUserLimit(user.brokerageLinkLimit), poolAvailable: capacity.available })
  const admin = isAdminEmail(user.email, process.env.ADMIN_EMAILS)
  // `code` lets the button say why it's unavailable. The reason text and the budget are for the owner only.
  const limit = effectiveUserLimit(user.brokerageLinkLimit)
  const userLimit = { used: userAttempts, limit, remaining: Math.max(0, limit - userAttempts) }
  return { allowed: !blocked, admin, code: blocked?.code, capApplies: production, userLimit, notice: userLimitNotice(limit), ...(admin ? { capacity, reason: blocked?.reason } : {}) }
}

export async function assertBrokerageLinkingAllowed(userId: string) {
  const access = await getBrokerageAccess(userId)
  if (!access.allowed) {
    if (access.code === "user_limit") throw new ApiError(access.notice, 403, { code: "USER_ITEM_LIMIT_REACHED" })
    if (access.code === "full") throw new ApiError("Production connection limit reached", 403, { code: "PRODUCTION_ITEM_LIMIT_REACHED" })
    throw new ApiError(("reason" in access && access.reason) || "Brokerage linking unavailable", 403)
  }
}

export type LinkReservation = { attemptId: string | null; profile: PlaidProfile }

/**
 * Commit before calling Plaid: rollback/timeout cannot replenish the lifetime budget.
 * `requestedPool` is the pool the Link session was created from (link-token response); the pool is chosen here, under the locks.
 */
export async function reserveProductionLinkAttempt(userId: string, publicToken: string, requestedPool = 1): Promise<LinkReservation> {
  if (!plaidLinkingEnabled()) throw new ApiError("Brokerage linking is not configured", 503)
  if (plaidEnvironment(process.env.PLAID_ENV) !== "production") {
    await assertBrokeragePermission(userId)
    return { attemptId: null, profile: newPlaidProfile(process.env) }
  }
  return db.transaction(async (store) => {
    await store.execute(sql`set local lock_timeout = '10s'`)
    // Reservation takes the global quota lock, then the user's permission lock.
    await store.execute(sql`select pg_advisory_xact_lock(hashtext('peerfolio-production-link-budget'))`)
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    const user = await assertBrokeragePermission(userId, store)
    const digest = createHash("sha256").update(publicToken).digest("hex")
    const prior = await store.query.productionLinkAttempts.findFirst({ where: eq(productionLinkAttempts.publicTokenDigest, digest) })
    if (prior) throw new ApiError("This connection attempt was already processed. Start a new connection to retry.", 409, { code: "LINK_ATTEMPT_ALREADY_RESERVED" })
    const capacity = await productionCapacity(store)
    // Same transaction and locks as the insert: two simultaneous reservations at the cap cannot both pass.
    // The override only moves this user's own cap; the pool choice below still applies, so it can never exceed pool capacity.
    const limit = effectiveUserLimit(user.brokerageLinkLimit)
    if ((await userLinkAttempts(userId, store)) >= limit) throw new ApiError(userLimitNotice(limit), 403, { code: "USER_ITEM_LIMIT_REACHED" })
    const choice = choosePool(capacity.pools, requestedPool)
    if (!choice.ok) {
      if (choice.reason === "full") throw new ApiError("Production connection limit reached", 403, { code: "PRODUCTION_ITEM_LIMIT_REACHED" })
      // The pool this Link session came from filled (or is not the open one). Nothing was reserved or sent to Plaid.
      throw new ApiError("Another connection just took the last spot in that group. Start a new connection and try again.", 409, { code: "LINK_POOL_CHANGED" })
    }
    const [attempt] = await store.insert(productionLinkAttempts).values({ userId, publicTokenDigest: digest, pool: choice.budget.pool }).returning({ id: productionLinkAttempts.id })
    return { attemptId: attempt!.id, profile: choice.budget.profile }
  })
}

export async function finishProductionLinkAttempt(attemptId: string | null, status: "succeeded" | "uncertain", plaidItemId?: string) {
  if (!attemptId) return
  await db.update(productionLinkAttempts).set({ status, plaidItemId: plaidItemId ?? null, completedAt: new Date() }).where(eq(productionLinkAttempts.id, attemptId))
}
