/** Server settings are deliberately deny-by-default. */
export function isAdminEmail(email: string, allowlist: string | undefined): boolean {
  const normalized = email.trim().toLowerCase()
  return !!normalized && (allowlist ?? "").split(",").some((value) => value.trim().toLowerCase() === normalized)
}

function nonnegativeInteger(value: string | undefined, fallback: number, name: string): number {
  if (value == null || value.trim() === "") return fallback
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be a nonnegative integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a nonnegative safe integer`)
  return parsed
}

/** Each free Plaid Trial team allows 10 Items. */
export const POOL_ITEM_LIMIT = 10

export type PoolId = 1 | 2
export type PoolProfile = "trial" | "trial2"
export type PoolConfig = { pool: PoolId; profile: PoolProfile; limit: number; previouslyUsed: number }
export type PoolBudget = PoolConfig & { attempts: number; used: number; reserved: number; uncertain: number; available: number }

/**
 * Pools in failover order. Pool 1 is the original Trial team and is always present; its limit and offset keep using
 * PLAID_PRODUCTION_ITEM_LIMIT / PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED, so a deployment with one Trial pair behaves exactly as before.
 * Pool 2 exists only when the caller says it is enabled (`trial2` argument: explicit PLAID_TRIAL_2_ENABLED=1 and valid credentials) in production, with its own optional
 * PLAID_TRIAL_ITEM_LIMIT_2 / PLAID_TRIAL_ITEMS_PREVIOUSLY_USED_2. Every pool is hard-capped at 10.
 */
export function productionPoolsChecked(env: Record<string, string | undefined>, trial2: boolean): { pools: PoolConfig[]; pool2Error: string | null } {
  const first = productionBudgetSettings(env)
  const pools: PoolConfig[] = [{ pool: 1, profile: "trial", limit: first.limit, previouslyUsed: first.previouslyUsed }]
  let pool2Error: string | null = null
  if (trial2 && env.PLAID_ENV === "production") {
    // A bad pool-2 setting must never take pool 1 (and with it every access check) down: pool 2 simply does not exist.
    try {
      pools.push({
        pool: 2,
        profile: "trial2",
        limit: Math.min(POOL_ITEM_LIMIT, nonnegativeInteger(env.PLAID_TRIAL_ITEM_LIMIT_2, POOL_ITEM_LIMIT, "PLAID_TRIAL_ITEM_LIMIT_2")),
        previouslyUsed: nonnegativeInteger(env.PLAID_TRIAL_ITEMS_PREVIOUSLY_USED_2, 0, "PLAID_TRIAL_ITEMS_PREVIOUSLY_USED_2"),
      })
    } catch (error) {
      pool2Error = error instanceof Error ? error.message : "invalid pool 2 configuration"
    }
  }
  return { pools, pool2Error }
}

export function productionPools(env: Record<string, string | undefined>, trial2: boolean): PoolConfig[] {
  return productionPoolsChecked(env, trial2).pools
}

/** Ledger counts per pool (`attempts` counts every status) joined with the configuration. */
export function poolBudgets(pools: PoolConfig[], ledger: Partial<Record<number, { attempts: number; reserved: number; uncertain: number }>>): PoolBudget[] {
  return pools.map((config) => {
    const row = ledger[config.pool]
    const attempts = row?.attempts ?? 0
    const used = attempts + config.previouslyUsed
    return { ...config, attempts, used, reserved: row?.reserved ?? 0, uncertain: row?.uncertain ?? 0, available: Math.max(0, config.limit - used) }
  })
}

export function totalCapacity(budgets: PoolBudget[]) {
  const sum = (key: "limit" | "used" | "reserved" | "uncertain" | "available" | "previouslyUsed" | "attempts") => budgets.reduce((total, pool) => total + pool[key], 0)
  return { limit: sum("limit"), used: sum("used"), reserved: sum("reserved"), uncertain: sum("uncertain"), available: sum("available"), previouslyUsed: sum("previouslyUsed"), attempts: sum("attempts") }
}

/** First pool with room, in failover order. */
export function firstAvailablePool(budgets: PoolBudget[]): PoolBudget | null {
  return budgets.find((pool) => pool.available > 0) ?? null
}

export type PoolChoice = { ok: true; budget: PoolBudget } | { ok: false; reason: "full" | "pool_filled" | "invalid" }

/**
 * Chooses the pool for a reservation. A Link session is bound to the team that created its token, so the caller names the
 * pool it was issued from. It is honoured only when that pool still has room and no earlier pool does (failover order).
 * A pool filled while the person was in Link yields `pool_filled`: no slot is consumed and they can start again.
 */
export function choosePool(budgets: PoolBudget[], requested: number): PoolChoice {
  const open = firstAvailablePool(budgets)
  if (!open) return { ok: false, reason: "full" }
  const wanted = budgets.find((pool) => pool.pool === requested)
  if (!wanted) return { ok: false, reason: "invalid" }
  if (wanted.available === 0) return { ok: false, reason: "pool_filled" }
  if (wanted.pool !== open.pool) return { ok: false, reason: "invalid" }
  return { ok: true, budget: wanted }
}

export function productionBudgetSettings(env: Record<string, string | undefined>) {
  const configuredLimit = nonnegativeInteger(env.PLAID_PRODUCTION_ITEM_LIMIT, 10, "PLAID_PRODUCTION_ITEM_LIMIT")
  // Production is Trial-only (the paid profile is disabled in code), so the 10 Item cap always applies.
  const trial = env.PLAID_ENV === "production"
  return {
    limit: trial ? Math.min(10, configuredLimit) : configuredLimit,
    previouslyUsed: nonnegativeInteger(env.PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED, 0, "PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED"),
  }
}

/**
 * Lifetime cap on link attempts that created (or may have created) a Plaid Item, per user.
 * Counted from production_link_attempts (reserved + uncertain + succeeded), so disconnecting never refunds a slot.
 * Raise this one number to allow more connections per account.
 */
export const USER_PRODUCTION_LINK_LIMIT = 2

/** Highest per-user limit an admin may set. */
export const MAX_USER_LINK_LIMIT = 10

/** The user's limit: the admin override when it is a valid whole number in range, else the default. */
export function effectiveUserLimit(override: number | null | undefined): number {
  return typeof override === "number" && Number.isInteger(override) && override >= 0 && override <= MAX_USER_LINK_LIMIT ? override : USER_PRODUCTION_LINK_LIMIT
}

export const MAX_REQUEST_NOTE = 500

/** Trims a request note to something storable; blank means no note. */
export function cleanRequestNote(value: string | null | undefined): string | null {
  const note = (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_REQUEST_NOTE)
  return note || null
}

/** Validates an admin write: a whole number 0..10, or null to clear the override. */
export function parseLinkLimitOverride(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === null) return { ok: true, value: null }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_USER_LINK_LIMIT) return { ok: true, value }
  return { ok: false }
}

export function userLimitNotice(limit: number): string {
  if (limit <= 0) return "Brokerage connections aren't available for your account right now."
  return `Only ${limit} brokerage ${limit === 1 ? "connection" : "connections"} per account for now. More coming soon.`
}

/** Shown before linking and as the disabled-state message once a user has used every slot. */
export const USER_LINK_LIMIT_NOTICE = userLimitNotice(USER_PRODUCTION_LINK_LIMIT)

export type BrokerageBlock = { code: "paused" | "off" | "unconfigured" | "user_limit" | "full"; reason: string }

/**
 * Pure access decision. Every signed-in user may link unless an admin explicitly blocked them.
 * Order matters: kill switch, per-user block, configuration, the user's own cap, then the shared pool.
 */
export function brokerageBlock(input: {
  paused: boolean
  userBlocked: boolean
  configured: boolean
  production: boolean
  userAttempts: number
  /** The user's effective limit; defaults to USER_PRODUCTION_LINK_LIMIT. */
  userLimit?: number
  poolAvailable: number
}): BrokerageBlock | null {
  if (input.paused) return { code: "paused", reason: "Brokerage connections are paused" }
  if (input.userBlocked) return { code: "off", reason: "Brokerage linking has been disabled for your account" }
  if (!input.configured) return { code: "unconfigured", reason: "Brokerage linking is not configured" }
  const limit = input.userLimit ?? USER_PRODUCTION_LINK_LIMIT
  if (input.production && input.userAttempts >= limit) return { code: "user_limit", reason: userLimitNotice(limit) }
  if (input.production && input.poolAvailable <= 0) return { code: "full", reason: "Production connection limit reached" }
  return null
}
