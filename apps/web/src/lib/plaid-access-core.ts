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

/** Shown before linking and as the disabled-state message once a user has used every slot. */
export const USER_LINK_LIMIT_NOTICE = `Only ${USER_PRODUCTION_LINK_LIMIT} brokerage connections per account for now. More coming soon.`

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
  poolAvailable: number
}): BrokerageBlock | null {
  if (input.paused) return { code: "paused", reason: "Brokerage connections are paused" }
  if (input.userBlocked) return { code: "off", reason: "Brokerage linking has been disabled for your account" }
  if (!input.configured) return { code: "unconfigured", reason: "Brokerage linking is not configured" }
  if (input.production && input.userAttempts >= USER_PRODUCTION_LINK_LIMIT) return { code: "user_limit", reason: USER_LINK_LIMIT_NOTICE }
  if (input.production && input.poolAvailable <= 0) return { code: "full", reason: "Production connection limit reached" }
  return null
}
